"""Hourly live inference (engine v3).

Keyed to the candle close (e.g. 14:00:00 UTC), never the job start time. If the job starts more than
MAX_LATE_MINUTES - SAFETY_MIN after the close, the hour is SKIPPED and logged as "missed" (never backfilled).
The database independently rejects inserts > 20 min late, duplicates per (coin, horizon, candle), and any
signal that does not follow the score/threshold rule, so re-running is always safe.

Writes ml/ops/last_predict.json (committed back by the workflow).

python -m hopium.predict [--dry-run]
"""
from __future__ import annotations

import json
import pickle
import sys
import time

import pandas as pd

from . import db, deribit, fetch
from .config import COINS, MAX_LATE_MINUTES, MODELS, ROOT
from .engine import predict_row
from .features_v3 import LOOKBACK_H, build_v3
from .lifecycle import stamp, strip

SAFETY_MIN = 2
OPS = ROOT / "ops" / "last_predict.json"


def minutes_late(close: pd.Timestamp) -> float:
    return (pd.Timestamp.now(tz="UTC") - close).total_seconds() / 60


def load_bundle(path=MODELS / "engine_v3.pkl") -> dict:
    with open(path, "rb") as fh:
        return pickle.load(fh)


def fetch_window(close: pd.Timestamp, tries: int = 5) -> dict[str, pd.DataFrame]:
    """Binance candles up to and including the one closing at `close`; retries while Binance catches up."""
    want = close - pd.Timedelta(hours=1)
    for i in range(tries):
        out = {c: fetch.binance_klines(c, close - pd.Timedelta(hours=LOOKBACK_H + 24), close) for c in COINS}
        if all(len(d) and d.ts.iloc[-1] == want for d in out.values()):
            return out
        print(f"  candle {want} not available yet (try {i + 1}/{tries})")
        if minutes_late(close) > MAX_LATE_MINUTES - SAFETY_MIN - 1:
            break
        time.sleep(20)
    raise RuntimeError(f"candle opening {want} never appeared")


def write_ops(res: dict):
    if res.get("dry_run"):
        return            # dry runs never touch the committed ops record
    OPS.parent.mkdir(exist_ok=True)
    OPS.write_text(json.dumps(res, indent=1, default=str))


def main(dry: bool = False) -> int:
    started = pd.Timestamp.now(tz="UTC")
    close = started.floor("h")
    iso = close.isoformat()
    late = minutes_late(close)
    res = {"job": "predict", "candle_close_time": iso, "started_minutes_after_close": round(late, 2), "dry_run": dry}
    print(f"candle close {iso}, job is {late:.1f} min late")
    if late > MAX_LATE_MINUTES - SAFETY_MIN:
        res |= {"status": "missed", "detail": f"started {late:.1f} min after candle close; skipped, never backfilled"}
        print("MISSED RUN:", res["detail"])
        if not dry:
            db.log_run("predict", "missed", iso, res["detail"])
        write_ops(res)
        return 0
    try:
        bundle = load_bundle()
        cfg, h = bundle["config"], bundle["config"]["h"]
        candles = fetch_window(close)
        start = close - pd.Timedelta(hours=LOOKBACK_H + 24)
        funding = {c: deribit.funding(c, start, close) for c in COINS} if "fund" in cfg["groups"] else None
        feats = build_v3(candles, fetch.fear_greed(), funding)
        rows = []
        generated = pd.Timestamp.now(tz="UTC")
        for coin in COINS:
            last = feats[feats.coin == coin].sort_values("ts").iloc[-1]
            assert last.t_known == close, (last.t_known, close)
            p = predict_row(bundle, last)
            generated = pd.Timestamp.now(tz="UTC")
            pu, pd_ = round(p["p_big_up"], 6), round(p["p_big_down"], 6)
            rows.append({
                "coin": coin, "horizon": f"{h}h", "prob_up": pu, "signal": p["signal"],
                "price_at_call": float(last.close), "candle_close_time": iso,
                "target_time": (close + pd.Timedelta(hours=h)).isoformat(), "model_version": bundle["version"],
                "p_big_up": pu, "p_big_down": pd_, "score": round(pu - pd_, 6),
                "threshold": bundle["threshold"], "k": cfg["k"],
            })
            # input cutoff = close of the last closed candle the features were built from (t_known)
            rows[-1] = stamp(rows[-1], started, generated, pd.Timestamp(last.t_known))
        for r in rows:
            print(f"  {r['coin']} {r['horizon']}  P(big up)={r['p_big_up']:.3f} P(big down)={r['p_big_down']:.3f} "
                  f"score={r['score']:+.3f} thr={r['threshold']}  {r['signal']:7s} @ {r['price_at_call']}")
        res["rows"] = rows
        if dry:
            res["status"] = "dry-run"
            write_ops(res)
            return 0
        late = minutes_late(close)
        if late > MAX_LATE_MINUTES - SAFETY_MIN:
            res |= {"status": "missed", "detail": f"computed {late:.1f} min after close; not inserted"}
            db.log_run("predict", "missed", iso, res["detail"])
            write_ops(res)
            return 0
        try:
            out = db.insert("predictions", rows, on_conflict="coin,horizon,candle_close_time")
        except Exception as e:  # trust-v1 columns missing until migration 20261105000000 is applied
            if "PGRST204" not in str(e):
                raise
            print("trust-v1 columns not in database yet; inserting without lifecycle fields")
            res["lifecycle_fields"] = "not stored: migration 20261105000000 not applied"
            out = db.insert("predictions", strip(rows), on_conflict="coin,horizon,candle_close_time")
        res |= {"status": "ok", "inserted": len(out), "already_existed": len(rows) - len(out),
                "inserted_minutes_after_close": round(late, 2), "ids": [r["id"] for r in out]}
        print(f"inserted {len(out)} new rows ({len(rows) - len(out)} already existed)")
        db.log_run("predict", "ok", iso, f"{len(out)} inserted")
        write_ops(res)
        return 0
    except Exception as e:
        res |= {"status": "error", "detail": repr(e)[:2000]}
        print(f"ERROR: {e}")
        if not dry:
            db.log_run("predict", "error", iso, repr(e))
        write_ops(res)
        return 1


if __name__ == "__main__":
    sys.exit(main(dry="--dry-run" in sys.argv))

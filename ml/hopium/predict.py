"""Hourly live inference.

Keyed to the candle close (e.g. 14:00:00 UTC), never the job start time. If the job starts more than
MAX_LATE_MINUTES after the close, the hour is SKIPPED and logged as "missed" (never backfilled).
The database independently rejects inserts > 20 min late and duplicate (coin, horizon, candle) rows,
so re-running is safe.

python -m hopium.predict [--dry-run]
"""
from __future__ import annotations

import pickle
import sys
import time

import pandas as pd

from . import db, fetch
from .config import COINS, HORIZONS, MAX_LATE_MINUTES, MODELS
from .features import build
from .grading import signal_for
from .model import CalibratedModel  # noqa: F401  (needed to unpickle)

LOOKBACK_H = 400          # > 168h volume z-score window + EWM warm-up (parity tested)
SAFETY_MIN = 2            # stop trying a little before the DB deadline


def minutes_late(close: pd.Timestamp) -> float:
    return (pd.Timestamp.now(tz="UTC") - close).total_seconds() / 60


def fetch_window(close: pd.Timestamp, tries: int = 5) -> dict[str, pd.DataFrame]:
    """Candles up to and including the one closing at `close`. Retries while Binance catches up."""
    want = close - pd.Timedelta(hours=1)      # open time of the last closed candle
    for i in range(tries):
        out = {c: fetch.binance_klines(c, close - pd.Timedelta(hours=LOOKBACK_H + 24), close) for c in COINS}
        if all(len(d) and d.ts.iloc[-1] == want for d in out.values()):
            return out
        print(f"  candle {want} not available yet (try {i + 1}/{tries})")
        if minutes_late(close) > MAX_LATE_MINUTES - SAFETY_MIN - 1:
            break
        time.sleep(20)
    raise RuntimeError(f"candle opening {want} never appeared")


def main(dry: bool = False) -> int:
    close = pd.Timestamp.now(tz="UTC").floor("h")
    iso = close.isoformat()
    late = minutes_late(close)
    print(f"candle close {iso}, job is {late:.1f} min late")
    if late > MAX_LATE_MINUTES - SAFETY_MIN:
        print("MISSED RUN: too late to predict honestly; skipping (no backfill).")
        db.log_run("predict", "missed", iso, f"started {late:.1f} min after candle close")
        return 0
    try:
        models = {h: pickle.load(open(MODELS / f"model_{h}.pkl", "rb")) for h in HORIZONS}
        candles = fetch_window(close)
        feats = build(candles, fetch.fear_greed())
        rows = []
        for coin in COINS:
            last = feats[feats.coin == coin].sort_values("ts").iloc[-1]
            assert last.t_known == close, (last.t_known, close)
            for name, h in HORIZONS.items():
                p = float(models[name].predict_proba(pd.DataFrame([last]))[0])
                rows.append({
                    "coin": coin, "horizon": name, "prob_up": round(p, 4), "signal": signal_for(round(p, 4)),
                    "price_at_call": float(last.close), "candle_close_time": iso,
                    "target_time": (close + pd.Timedelta(hours=h)).isoformat(),
                    "model_version": f"{models[name].version}-{name}",
                })
        for r in rows:
            print(f"  {r['coin']} {r['horizon']}  p_up={r['prob_up']:.4f}  {r['signal']:7s} @ {r['price_at_call']}")
        if dry:
            return 0
        if minutes_late(close) > MAX_LATE_MINUTES - SAFETY_MIN:
            db.log_run("predict", "missed", iso, "computed too late to insert")
            print("MISSED RUN: computed too late; not inserting.")
            return 0
        out = db.insert("predictions", rows, on_conflict="coin,horizon,candle_close_time")
        print(f"inserted {len(out)} new rows ({len(rows) - len(out)} already existed)")
        db.log_run("predict", "ok", iso, f"{len(out)} inserted")
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        db.log_run("predict", "error", iso, repr(e))
        return 1


if __name__ == "__main__":
    sys.exit(main(dry="--dry-run" in sys.argv))

"""Hourly live inference. Builds features from fresh data exactly like training
and inserts one immutable prediction per coin x horizon into Supabase.

python predict.py [--dry-run]
"""
from __future__ import annotations

import pickle
import sys
from datetime import timedelta

import pandas as pd

import fetch
from config import COINS, HORIZONS, MODELS, SIGNAL_THRESHOLD
from features import build
from train import CalibratedModel  # noqa: F401  (needed to unpickle)

LOOKBACK_H = 400  # >168h for vol z-score + warmup


def signal_for(p):
    if p >= SIGNAL_THRESHOLD:
        return "UP"
    if p <= 1 - SIGNAL_THRESHOLD:
        return "DOWN"
    return "NO-CALL"


def latest_features(coin, fng):
    now = pd.Timestamp.now(tz="UTC")
    start = now - timedelta(hours=LOOKBACK_H)
    c = fetch.fetch_candles(coin, int(start.timestamp() * 1000))
    f = fetch.fetch_funding(coin, now - timedelta(days=70))
    oi = fetch.fetch_oi(coin, now - timedelta(days=5))
    df = build(c, f, oi, fng, coin)
    return df.iloc[-1]


def main(dry=False):
    models = {h: pickle.load(open(MODELS / f"model_{h}h.pkl", "rb")) for h in HORIZONS}
    import json
    version = json.load(open(MODELS / "metrics.json"))["trained_at"][:16]
    fng = fetch.fetch_fng()
    rows = []
    for coin in COINS:
        row = latest_features(coin, fng)
        X = pd.DataFrame([row])
        for h, m in models.items():
            p = float(m.predict_proba(X)[0])
            call_time = row.ts + pd.Timedelta(hours=1)  # candle close
            rows.append({
                "coin": coin, "horizon_h": h, "prob_up": round(p, 4), "signal": signal_for(p),
                "price_at_call": float(row.close), "candle_ts": row.ts.isoformat(),
                "target_time": (call_time + pd.Timedelta(hours=h)).isoformat(),
                "model_version": version,
            })
    for r in rows:
        print(f"{r['coin']} {r['horizon_h']}h p_up={r['prob_up']:.3f} {r['signal']} @ {r['price_at_call']}")
    if not dry:
        import db
        out = db.insert("predictions", rows)
        print(f"inserted {len(out)} new predictions")


if __name__ == "__main__":
    main(dry="--dry-run" in sys.argv)

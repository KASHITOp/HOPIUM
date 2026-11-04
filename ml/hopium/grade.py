"""Grade predictions whose target_time has passed. Writes to `outcomes` only.

Outcome price = close of the 1h candle that ends at target_time.
"""
from __future__ import annotations

import pandas as pd

import db
import fetch
from config import FLAT_THRESHOLD


def close_at(coin, target):
    """Close of the candle [target-1h, target)."""
    start = target - pd.Timedelta(hours=1)
    c = fetch.fetch_candles(coin, int(start.timestamp() * 1000))
    c = c[c.ts == start]
    return None if c.empty else float(c.close.iloc[0])


def grade_row(p, price):
    r = price / p["price_at_call"] - 1
    actual = "FLAT" if abs(r) < FLAT_THRESHOLD else ("UP" if r > 0 else "DOWN")
    hit = None if p["signal"] == "NO-CALL" or actual == "FLAT" else (p["signal"] == actual)
    mc = None if actual == "FLAT" else ((p["prob_up"] > 0.5) == (actual == "UP"))
    return {"prediction_id": p["id"], "price_at_target": price, "fwd_ret": r, "actual": actual,
            "hit": hit, "model_correct": mc}


def main():
    now = pd.Timestamp.now(tz="UTC")
    pending = db.select("graded", {"select": "id,coin,signal,prob_up,price_at_call,target_time",
                                   "actual": "is.null", "target_time": f"lte.{now.isoformat()}",
                                   "order": "target_time.asc", "limit": "500"})
    print(f"{len(pending)} pending")
    out, cache = [], {}
    for p in pending:
        t = pd.Timestamp(p["target_time"]).tz_convert("UTC")
        key = (p["coin"], t)
        if key not in cache:
            cache[key] = close_at(p["coin"], t)
        if cache[key] is None:
            continue  # candle not closed / not available yet
        out.append(grade_row(p, cache[key]))
    if out:
        db.insert("outcomes", out)
    for o in out:
        print(o)
    print(f"graded {len(out)}")


if __name__ == "__main__":
    main()

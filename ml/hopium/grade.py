"""Grade every ungraded prediction whose target_time has passed.

Exit price = close of the Binance spot 1h candle that ENDS at target_time (opens at target_time - 1h).
Only grading columns are written; the database refuses anything else and refuses re-grading.

python -m hopium.grade
"""
from __future__ import annotations

import sys

import pandas as pd

from . import db, fetch
from .grading import grade


def exit_price(coin: str, target: pd.Timestamp, cache: dict) -> float | None:
    key = (coin, target)
    if key not in cache:
        start = target - pd.Timedelta(hours=1)
        c = fetch.binance_klines(coin, start, target)
        c = c[c.ts == start]
        cache[key] = float(c.close.iloc[0]) if len(c) else None
    return cache[key]


def main() -> int:
    now = pd.Timestamp.now(tz="UTC").isoformat()
    try:
        pending = db.select("predictions", {
            "select": "id,coin,horizon,signal,price_at_call,target_time",
            "graded_at": "is.null", "target_time": f"lte.{now}", "order": "target_time.asc", "limit": "1000"})
        print(f"{len(pending)} predictions due")
        cache, done = {}, 0
        for p in pending:
            px = exit_price(p["coin"], pd.Timestamp(p["target_time"]).tz_convert("UTC"), cache)
            if px is None:
                print(f"  #{p['id']}: exit candle not available yet")
                continue
            g = grade(p["signal"], float(p["price_at_call"]), px)
            res = db.patch("predictions", {"id": f"eq.{p['id']}", "graded_at": "is.null"}, g)
            done += len(res or [])
            print(f"  #{p['id']} {p['coin']} {p['horizon']} {p['signal']}: {g['outcome']} ({g['move']:+.4%})")
        db.log_run("grade", "ok", detail=f"{done} graded")
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        db.log_run("grade", "error", detail=repr(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())

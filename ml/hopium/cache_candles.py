"""Keep the last 90 days of Binance 1h candles in Supabase `candles_cache` for the site's charts and lab.

python -m hopium.cache_candles [--days 90]
"""
from __future__ import annotations

import argparse
import sys

import pandas as pd

from . import db, fetch
from .config import COINS

KEEP_DAYS = 90


def main(days: int) -> int:
    now = pd.Timestamp.now(tz="UTC")
    try:
        for coin in COINS:
            c = fetch.binance_klines(coin, now - pd.Timedelta(days=days))
            rows = [{"coin": coin, "open_time": t.isoformat(), "o": o, "h": h, "l": l, "c": cl, "v": v}
                    for t, o, h, l, cl, v in c[["ts", "open", "high", "low", "close", "volume"]].itertuples(index=False)]
            for i in range(0, len(rows), 1000):
                db.insert("candles_cache", rows[i:i + 1000], on_conflict="coin,open_time", ignore_duplicates=False)
            print(f"{coin}: upserted {len(rows)}")
        cutoff = (now - pd.Timedelta(days=KEEP_DAYS)).isoformat()
        db.delete("candles_cache", {"open_time": f"lt.{cutoff}"})
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    sys.exit(main(ap.parse_args().days))

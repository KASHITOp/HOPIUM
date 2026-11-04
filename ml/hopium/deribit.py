"""Deribit perpetual funding (public, no key). Candidate live feature: reachable from this container;
reachability from GitHub's US runners must be confirmed by .github/workflows/probe.yml before going live."""
from __future__ import annotations

import time

import pandas as pd
import requests

from .config import DATA

INSTR = {"BTC": "BTC-PERPETUAL", "ETH": "ETH-PERPETUAL", "SOL": "SOL_USDC-PERPETUAL"}
URL = "https://www.deribit.com/api/v2/public/get_funding_rate_history"


def funding(coin: str, start: pd.Timestamp, end: pd.Timestamp | None = None) -> pd.DataFrame:
    end = end or pd.Timestamp.now(tz="UTC")
    rows, cur = [], start
    while cur < end:
        nxt = min(cur + pd.Timedelta(days=30), end)
        for i in range(4):
            try:
                r = requests.get(URL, params={"instrument_name": INSTR[coin],
                                              "start_timestamp": int(cur.timestamp() * 1000),
                                              "end_timestamp": int(nxt.timestamp() * 1000)}, timeout=20)
                r.raise_for_status()
                rows += r.json()["result"]
                break
            except requests.RequestException:
                if i == 3:
                    raise
                time.sleep(2 ** (i + 1))
        cur = nxt
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df.timestamp, unit="ms", utc=True)   # end of the funding hour
    return df[["ts", "interest_1h"]].rename(columns={"interest_1h": "funding_1h"}) \
        .drop_duplicates("ts").sort_values("ts").reset_index(drop=True)


if __name__ == "__main__":
    s = pd.Timestamp("2023-09-01", tz="UTC")
    for c in INSTR:
        f = funding(c, s)
        f.to_parquet(DATA / f"deribit_funding_{c}.parquet", index=False)
        print(c, len(f), f.ts.min(), f.ts.max())

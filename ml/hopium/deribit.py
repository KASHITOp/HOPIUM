"""Deribit perpetual funding (public, no key). Candidate live feature: reachable from this container;
reachability from GitHub's US runners must be confirmed by .github/workflows/probe.yml before going live."""
from __future__ import annotations

import time

import pandas as pd
import requests

from .config import DATA

INSTR = {"BTC": "BTC-PERPETUAL", "ETH": "ETH-PERPETUAL", "SOL": "SOL_USDC-PERPETUAL"}
URL = "https://www.deribit.com/api/v2/public/get_funding_rate_history"


BACKOFF_S = (3, 6, 12, 24, 45, 60, 90, 120)


def funding(coin: str, start: pd.Timestamp, end: pd.Timestamp | None = None, deadline: pd.Timestamp | None = None,
            sleep=time.sleep, now=lambda: pd.Timestamp.now(tz="UTC")) -> pd.DataFrame:
    """Retries with backoff until `deadline`; then raises with the real reason. No substitute data, ever."""
    end = end or pd.Timestamp.now(tz="UTC")
    rows, cur = [], start
    while cur < end:
        nxt = min(cur + pd.Timedelta(days=30), end)
        for i in range(len(BACKOFF_S) + 1):
            try:
                r = requests.get(URL, params={"instrument_name": INSTR[coin],
                                              "start_timestamp": int(cur.timestamp() * 1000),
                                              "end_timestamp": int(nxt.timestamp() * 1000)}, timeout=20)
                r.raise_for_status()
                rows += r.json()["result"]
                break
            except requests.RequestException as e:
                wait = BACKOFF_S[i] if i < len(BACKOFF_S) else None
                if wait is None or (deadline is not None and now() + pd.Timedelta(seconds=wait) > deadline):
                    raise RuntimeError(f"Deribit funding unavailable for {coin} after {i + 1} attempts: {e}") from e
                print(f"  deribit {coin}: {type(e).__name__} {getattr(e.response, 'status_code', '')}, retry in {wait}s")
                sleep(wait)
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

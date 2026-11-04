"""Market data.

Live-safe sources (usable as model features, reachable from US GitHub runners):
  * Binance spot 1h klines via data-api.binance.vision (fallback api.binance.com)
  * Fear & Greed via api.alternative.me
History fallback only: Coinbase Exchange candles (USD pairs). Never used for live calls or grading.

python -m hopium.fetch   # (re)build the 3+ year parquet cache in ml/data (incremental)
"""
from __future__ import annotations

import time
from datetime import timedelta

import pandas as pd
import requests

from .config import BINANCE_HOSTS, COINBASE, COINS, DATA, HISTORY_DAYS

S = requests.Session()
S.headers["User-Agent"] = "hopium-ml/2.0 (+https://github.com/kashitop/hopium)"
COLS = ["ts", "open", "high", "low", "close", "volume"]
FLOW = ["quote_volume", "trades", "taker_buy_base"]   # Binance-only order-flow fields


def _get(url, params=None, tries=4):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=20)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            if i == tries - 1:
                raise
            print(f"  retry {i + 1} {url}: {e}")
            time.sleep(2 ** (i + 1))


def binance_klines(coin: str, start: pd.Timestamp, end: pd.Timestamp | None = None) -> pd.DataFrame:
    """Hourly spot candles [start, end). Only fully CLOSED candles are returned."""
    sym, last_err = f"{coin}USDT", None
    for host in BINANCE_HOSTS:
        try:
            rows, cur = [], int(start.timestamp() * 1000)
            while True:
                p = {"symbol": sym, "interval": "1h", "startTime": cur, "limit": 1000}
                if end is not None:
                    p["endTime"] = int(end.timestamp() * 1000) - 1
                batch = _get(f"{host}/api/v3/klines", p)
                if not isinstance(batch, list):
                    raise RuntimeError(f"unexpected response: {str(batch)[:200]}")
                rows += batch
                if len(batch) < 1000:
                    break
                cur = batch[-1][0] + 3_600_000
            df = pd.DataFrame([r[:6] + [r[7], r[8], r[9]] for r in rows], columns=COLS + FLOW)
            df["ts"] = pd.to_datetime(df.ts.astype("int64"), unit="ms", utc=True)
            df[COLS[1:] + FLOW] = df[COLS[1:] + FLOW].astype(float)
            return _closed_only(df)
        except Exception as e:
            last_err = e
            print(f"  {host} failed: {e}")
    raise RuntimeError(f"Binance unreachable: {last_err}")


def coinbase_klines(coin: str, start: pd.Timestamp) -> pd.DataFrame:
    """History fallback. Coinbase returns at most 300 candles per call: [time, low, high, open, close, volume]."""
    rows, cur, now = [], start, pd.Timestamp.now(tz="UTC")
    while cur < now:
        nxt = min(cur + timedelta(hours=300), now)
        batch = _get(f"{COINBASE}/products/{coin}-USD/candles",
                     {"granularity": 3600, "start": cur.isoformat(), "end": nxt.isoformat()})
        rows += batch
        cur = nxt
        time.sleep(0.15)  # public rate limit
    df = pd.DataFrame(rows, columns=["ts", "low", "high", "open", "close", "volume"])[COLS]
    df["ts"] = pd.to_datetime(df.ts.astype("int64"), unit="s", utc=True)
    df[COLS[1:]] = df[COLS[1:]].astype(float)
    for f in FLOW:
        df[f] = float("nan")       # Coinbase has no order-flow fields
    return _closed_only(df)


def _closed_only(df: pd.DataFrame) -> pd.DataFrame:
    """Drop the still-forming candle: a candle opening at ts closes at ts + 1h."""
    now = pd.Timestamp.now(tz="UTC")
    df = df[df.ts + pd.Timedelta(hours=1) <= now]
    return df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)


def fear_greed() -> pd.DataFrame:
    d = pd.DataFrame(_get("https://api.alternative.me/fng/", {"limit": 0, "format": "json"})["data"])
    d["ts"] = pd.to_datetime(d.timestamp.astype("int64"), unit="s", utc=True)
    d["fng"] = d.value.astype(float)
    return d[["ts", "fng"]].sort_values("ts").reset_index(drop=True)


def load(name: str) -> pd.DataFrame | None:
    p = DATA / f"{name}.parquet"
    return pd.read_parquet(p) if p.exists() else None


def run(days: int = HISTORY_DAYS):
    start = pd.Timestamp.now(tz="UTC").normalize() - timedelta(days=days)
    for coin in COINS:
        old = load(f"candles_{coin}")
        if old is not None and len(old) and old.ts.min() <= start + timedelta(days=2):
            since = old.ts.max() - timedelta(hours=3)
        else:
            old, since = None, start
        try:
            new = binance_klines(coin, since)
        except RuntimeError as e:
            print(f"  {coin}: Binance failed ({e}); falling back to Coinbase for history")
            new = coinbase_klines(coin, since)
        c = pd.concat([x for x in (old, new) if x is not None])
        c = c.drop_duplicates("ts", keep="last").sort_values("ts").reset_index(drop=True)
        c.to_parquet(DATA / f"candles_{coin}.parquet", index=False)
        gaps = int((c.ts.diff() > pd.Timedelta(hours=1)).sum())
        print(f"{coin}: {len(c)} candles {c.ts.min()} -> {c.ts.max()} ({gaps} gaps)")
    fear_greed().to_parquet(DATA / "fng.parquet", index=False)
    print("fear & greed ok")


if __name__ == "__main__":
    run()

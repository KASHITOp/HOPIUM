"""Fetch candles, funding, open interest and fear/greed. Cached as parquet.

Usage: python fetch.py            # full history (incremental if cache exists)
"""
from __future__ import annotations

import io
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

from config import ARCHIVE, COINS, DATA, HISTORY_DAYS, SPOT_HOSTS

S = requests.Session()
S.headers["User-Agent"] = "hopium-ml/1.0"


def _get(url, params=None, tries=4):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=20)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == tries - 1:
                raise
            time.sleep(2 ** i)


# ---------------------------------------------------------------- candles
def _binance_klines(sym, start_ms, end_ms=None):
    rows = []
    for host in SPOT_HOSTS:
        try:
            cur = start_ms
            while True:
                p = {"symbol": sym, "interval": "1h", "startTime": cur, "limit": 1000}
                if end_ms:
                    p["endTime"] = end_ms
                r = _get(f"{host}/api/v3/klines", p)
                batch = r.json() if r is not None else []
                if not isinstance(batch, list) or not batch:
                    break
                rows += batch
                cur = batch[-1][0] + 3600_000
                if len(batch) < 1000:
                    break
            if rows:
                break
        except Exception as e:  # try next host
            print(f"  {host} failed: {e}")
    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume",
                                     "close_time", "quote_volume", "trades", "tb_base", "tb_quote", "_"])
    return df


def _bybit_klines(sym, start_ms):
    rows, end = [], int(time.time() * 1000)
    while end > start_ms:
        r = _get("https://api.bybit.com/v5/market/kline",
                 {"category": "spot", "symbol": sym, "interval": "60", "end": end, "limit": 1000})
        lst = (r.json().get("result") or {}).get("list") or [] if r is not None else []
        if not lst:
            break
        rows += lst
        end = int(lst[-1][0]) - 1
    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume", "quote_volume"])
    df["open_time"] = df.open_time.astype("int64")
    return df[df.open_time >= start_ms]


def fetch_candles(coin, start_ms):
    sym = f"{coin}USDT"
    df = _binance_klines(sym, start_ms)
    if df.empty:
        print("  binance empty, falling back to bybit")
        df = _bybit_klines(sym, start_ms)
    if df.empty:
        raise RuntimeError(f"no candles for {coin}")
    df["ts"] = pd.to_datetime(df.open_time.astype("int64"), unit="ms", utc=True)
    for c in ["open", "high", "low", "close", "volume", "quote_volume"]:
        df[c] = df[c].astype(float)
    df = df[["ts", "open", "high", "low", "close", "volume", "quote_volume"]]
    # drop the still-open candle
    now = pd.Timestamp.now(tz="UTC").floor("h")
    df = df[df.ts < now]
    return df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)


# ---------------------------------------------------------------- funding
def _zip_csv(url):
    r = _get(url)
    if r is None:
        return None
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        return pd.read_csv(z.open(z.namelist()[0]))


def fetch_funding(coin, start):
    sym = f"{coin}USDT"
    months = pd.period_range(start.strftime("%Y-%m"), pd.Timestamp.now(tz="UTC").strftime("%Y-%m"), freq="M")
    urls = [f"{ARCHIVE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{m}.zip" for m in months]
    with ThreadPoolExecutor(8) as ex:
        parts = [p for p in ex.map(_zip_csv, urls) if p is not None]
    df = pd.concat(parts)
    df["ts"] = pd.to_datetime(df.calc_time, unit="ms", utc=True).dt.floor("h")
    return df[["ts", "last_funding_rate"]].rename(columns={"last_funding_rate": "funding"}) \
        .drop_duplicates("ts").sort_values("ts").reset_index(drop=True)


# ---------------------------------------------------------------- open interest
def _metrics_day(args):
    sym, day = args
    df = _zip_csv(f"{ARCHIVE}/daily/metrics/{sym}/{sym}-metrics-{day}.zip")
    if df is None or df.empty:
        return None
    df["ts"] = pd.to_datetime(df.create_time, utc=True)
    df = df[df.ts.dt.minute == 0]  # hourly snapshots
    return df[["ts", "sum_open_interest_value"]].rename(columns={"sum_open_interest_value": "oi"})


def fetch_oi(coin, start, existing=None):
    sym = f"{coin}USDT"
    s = start
    if existing is not None and len(existing):
        s = existing.ts.max().normalize() - timedelta(days=1)
    days = pd.date_range(s.normalize(), pd.Timestamp.now(tz="UTC").normalize() - timedelta(days=1), freq="D")
    with ThreadPoolExecutor(16) as ex:
        parts = [p for p in ex.map(_metrics_day, [(sym, d.strftime("%Y-%m-%d")) for d in days]) if p is not None]
    df = pd.concat(([existing] if existing is not None else []) + parts)
    return df.drop_duplicates("ts", keep="last").sort_values("ts").reset_index(drop=True)


# ---------------------------------------------------------------- fear & greed
def fetch_fng():
    r = _get("https://api.alternative.me/fng/", {"limit": 0, "format": "json"})
    d = pd.DataFrame(r.json()["data"])
    d["ts"] = pd.to_datetime(d.timestamp.astype("int64"), unit="s", utc=True)
    d["fng"] = d.value.astype(float)
    return d[["ts", "fng"]].sort_values("ts").reset_index(drop=True)


def _load(name):
    p = DATA / f"{name}.parquet"
    return pd.read_parquet(p) if p.exists() else None


def run(days=HISTORY_DAYS):
    start = pd.Timestamp.now(tz="UTC").normalize() - timedelta(days=days)
    for coin in COINS:
        t0 = time.time()
        old = _load(f"candles_{coin}")
        if old is not None and len(old) and old.ts.min() <= start + timedelta(days=2):
            since = old.ts.max() - timedelta(hours=3)
            new = fetch_candles(coin, int(since.timestamp() * 1000))
            c = pd.concat([old, new]).drop_duplicates("ts", keep="last").sort_values("ts")
        else:
            c = fetch_candles(coin, int(start.timestamp() * 1000))
        c.to_parquet(DATA / f"candles_{coin}.parquet", index=False)
        f = fetch_funding(coin, start)
        f.to_parquet(DATA / f"funding_{coin}.parquet", index=False)
        oi = fetch_oi(coin, start, _load(f"oi_{coin}"))
        oi.to_parquet(DATA / f"oi_{coin}.parquet", index=False)
        print(f"{coin}: {len(c)} candles ({c.ts.min()} -> {c.ts.max()}), "
              f"{len(f)} funding, {len(oi)} oi  [{time.time()-t0:.0f}s]")
    fetch_fng().to_parquet(DATA / "fng.parquet", index=False)
    print("fear/greed ok")


if __name__ == "__main__":
    run()

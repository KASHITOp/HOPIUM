"""Feature engineering. Every feature at row t uses only data known when
candle t has CLOSED (i.e. at time ts + 1h). Labels are built separately and
are the ONLY place future prices appear.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from config import COINS, DATA, FLAT_THRESHOLD, OI_LAG_H

FEATURES = [
    "ret_1", "ret_4", "ret_12", "ret_24", "rsi_14", "macd", "macd_sig", "macd_hist",
    "atr_pct", "bb_pctb", "vwap_dist", "vol_z", "funding_prev_month", "funding_last",
    "oi_chg_24", "fng", "fng_chg_7", "hour", "dow", "coin_id",
]


def _rsi(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def build(c: pd.DataFrame, funding: pd.DataFrame, oi: pd.DataFrame, fng: pd.DataFrame, coin: str) -> pd.DataFrame:
    df = c.copy().sort_values("ts").reset_index(drop=True)
    close = df.close
    for h in (1, 4, 12, 24):
        df[f"ret_{h}"] = close.pct_change(h)
    df["rsi_14"] = _rsi(close)
    ema12, ema26 = close.ewm(span=12, adjust=False).mean(), close.ewm(span=26, adjust=False).mean()
    macd = (ema12 - ema26) / close
    df["macd"] = macd
    df["macd_sig"] = macd.ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df.macd - df.macd_sig
    prev = close.shift(1)
    tr = pd.concat([df.high - df.low, (df.high - prev).abs(), (df.low - prev).abs()], axis=1).max(axis=1)
    df["atr_pct"] = tr.ewm(alpha=1 / 14, adjust=False).mean() / close
    ma, sd = close.rolling(20).mean(), close.rolling(20).std()
    df["bb_pctb"] = (close - (ma - 2 * sd)) / (4 * sd)
    tp = (df.high + df.low + close) / 3
    vwap = (tp * df.volume).rolling(24).sum() / df.volume.rolling(24).sum()
    df["vwap_dist"] = close / vwap - 1
    lv = np.log1p(df.volume)
    df["vol_z"] = (lv - lv.rolling(168).mean()) / lv.rolling(168).std()

    # Feature time = candle close = ts + 1h
    df["t_known"] = df.ts + pd.Timedelta(hours=1)

    # Funding: archives are monthly, so at time t we only know complete months before t's month.
    f = funding.copy()
    f["month"] = f.ts.dt.tz_localize(None).dt.to_period("M")
    fm = f.groupby("month").agg(funding_prev_month=("funding", "mean"), funding_last=("funding", "last"))
    fm.index = fm.index + 1  # available during the following month
    m = df.t_known.dt.tz_localize(None).dt.to_period("M")
    df = df.assign(_m=m).join(fm, on="_m").drop(columns="_m")

    # Open interest: lagged by OI_LAG_H (daily archive publication lag)
    o = oi[oi.oi > 0][["ts", "oi"]].drop_duplicates("ts").set_index("ts").sort_index()
    o = o.reindex(pd.date_range(o.index.min(), o.index.max(), freq="h"))
    o["oi_chg_24"] = o.oi.pct_change(24, fill_method=None)
    o = o.rename_axis("ts").reset_index().dropna(subset=["oi_chg_24"])
    o["avail"] = o.ts + pd.Timedelta(hours=OI_LAG_H)
    df = pd.merge_asof(df.sort_values("t_known"), o[["avail", "oi_chg_24"]].rename(columns={"avail": "t_known"}),
                       on="t_known", direction="backward", tolerance=pd.Timedelta(hours=6))

    # Fear & greed: daily value stamped 00:00 UTC; use only the PREVIOUS day's value.
    g = fng.copy().sort_values("ts")
    g["fng_chg_7"] = g.fng.diff(7)
    g["avail"] = g.ts + pd.Timedelta(days=1)
    df = pd.merge_asof(df, g[["avail", "fng", "fng_chg_7"]].rename(columns={"avail": "t_known"}),
                       on="t_known", direction="backward", tolerance=pd.Timedelta(days=3))

    df["hour"] = df.t_known.dt.hour
    df["dow"] = df.t_known.dt.dayofweek
    df["coin_id"] = COINS.index(coin)
    df["coin"] = coin
    return df.sort_values("ts").reset_index(drop=True)


def add_labels(df: pd.DataFrame, h: int) -> pd.DataFrame:
    """fwd return from close of candle t to close of candle t+h. FUTURE DATA - never a feature."""
    df = df.copy()
    df["fwd_ret"] = df.close.shift(-h) / df.close - 1
    df["y"] = np.where(df.fwd_ret.abs() < FLAT_THRESHOLD, np.nan, (df.fwd_ret > 0).astype(float))
    df.loc[df.fwd_ret.isna(), "y"] = np.nan
    return df


def load_all() -> pd.DataFrame:
    fng = pd.read_parquet(DATA / "fng.parquet")
    out = []
    for coin in COINS:
        c = pd.read_parquet(DATA / f"candles_{coin}.parquet")
        f = pd.read_parquet(DATA / f"funding_{coin}.parquet")
        o = pd.read_parquet(DATA / f"oi_{coin}.parquet")
        out.append(build(c, f, o, fng, coin))
    return pd.concat(out, ignore_index=True)


if __name__ == "__main__":
    d = load_all()
    print(d[FEATURES].describe().T[["count", "mean", "min", "max"]])

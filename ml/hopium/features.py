"""Feature engineering.

Row t describes the candle that OPENS at ts and CLOSES at ts + 1h. Every feature on row t uses only
information available at ts + 1h (the moment the prediction is made). Causality is enforced by:
  * only backward-looking pandas ops (rolling / ewm / shift(+k) / pct_change)
  * fear & greed joined by "previous UTC day" only
  * tests/test_no_lookahead.py, which perturbs future candles and asserts past features do not move
Labels (future data) are built only in add_labels() and never fed back as features.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import COINS
from .grading import label

FEATURES = [
    "ret_1", "ret_4", "ret_12", "ret_24", "rsi_14", "macd", "macd_sig", "macd_hist", "atr_pct",
    "bb_pctb", "vwap_dist", "vol_z", "rvol_24", "rel_btc_4", "rel_btc_24", "fng", "fng_chg_7",
    "hour", "dow", "coin_id",
]


def _rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def _hourly(c: pd.DataFrame) -> pd.DataFrame:
    """Put candles on a strict hourly grid so row offsets equal hours (gaps become NaN, never filled)."""
    c = c.drop_duplicates("ts").set_index("ts").sort_index()
    grid = pd.date_range(c.index.min(), c.index.max(), freq="h")
    return c.reindex(grid).rename_axis("ts").reset_index()


def price_features(c: pd.DataFrame) -> pd.DataFrame:
    df = _hourly(c)
    close = df.close
    for h in (1, 4, 12, 24):
        df[f"ret_{h}"] = close.pct_change(h, fill_method=None)
    df["rsi_14"] = _rsi(close)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    df["macd"] = (ema12 - ema26) / close
    df["macd_sig"] = df.macd.ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df.macd - df.macd_sig
    prev = close.shift(1)
    tr = pd.concat([df.high - df.low, (df.high - prev).abs(), (df.low - prev).abs()], axis=1).max(axis=1)
    df["atr_pct"] = tr.ewm(alpha=1 / 14, adjust=False).mean() / close
    ma, sd = close.rolling(20).mean(), close.rolling(20).std()
    df["bb_pctb"] = (close - (ma - 2 * sd)) / (4 * sd)
    tp = (df.high + df.low + close) / 3
    df["vwap_dist"] = close / ((tp * df.volume).rolling(24).sum() / df.volume.rolling(24).sum()) - 1
    lv = np.log1p(df.volume)
    df["vol_z"] = (lv - lv.rolling(168).mean()) / lv.rolling(168).std()
    df["rvol_24"] = np.log(close).diff().rolling(24).std()
    df["t_known"] = df.ts + pd.Timedelta(hours=1)      # candle close = prediction time
    df["hour"] = df.t_known.dt.hour
    df["dow"] = df.t_known.dt.dayofweek
    return df


def build(candles: dict[str, pd.DataFrame], fng: pd.DataFrame) -> pd.DataFrame:
    """candles: {coin: DataFrame[ts, open, high, low, close, volume]} -> long frame, one row per coin-hour."""
    per = {coin: price_features(candles[coin]) for coin in COINS if coin in candles}
    btc = per["BTC"][["ts", "ret_4", "ret_24"]].rename(columns={"ret_4": "btc_4", "ret_24": "btc_24"})

    g = fng.sort_values("ts").copy()
    g["fng_chg_7"] = g.fng.diff(7)
    g["avail"] = g.ts + pd.Timedelta(days=1)            # only the PREVIOUS day's index is known

    out = []
    for coin, df in per.items():
        df = df.merge(btc, on="ts", how="left")
        if coin == "BTC":
            df["rel_btc_4"] = 0.0
            df["rel_btc_24"] = 0.0
        else:
            df["rel_btc_4"] = df.ret_4 - df.btc_4
            df["rel_btc_24"] = df.ret_24 - df.btc_24
        df = pd.merge_asof(df.sort_values("t_known"),
                           g[["avail", "fng", "fng_chg_7"]].rename(columns={"avail": "t_known"}),
                           on="t_known", direction="backward", tolerance=pd.Timedelta(days=3))
        df["coin"] = coin
        df["coin_id"] = COINS.index(coin)
        out.append(df.drop(columns=["btc_4", "btc_24"]))
    return pd.concat(out, ignore_index=True).dropna(subset=["close"]).reset_index(drop=True)


def add_labels(df: pd.DataFrame, h: int) -> pd.DataFrame:
    """FUTURE DATA. move = (close[t+h] - close[t]) / close[t]; label via grading.label (flat => NaN)."""
    parts = []
    for _, g in df.groupby("coin", sort=False):
        g = g.sort_values("ts").copy()
        nxt = g.set_index("ts").close.reindex(g.ts + pd.Timedelta(hours=h)).to_numpy()
        g["fwd_move"] = nxt / g.close.to_numpy() - 1
        g["y"] = [label(m) for m in g.fwd_move]
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


def load_all() -> pd.DataFrame:
    from .fetch import load
    candles = {c: load(f"candles_{c}") for c in COINS}
    return build(candles, load("fng"))

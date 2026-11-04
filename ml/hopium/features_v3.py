"""v3 features: v2 + order flow, multi-timeframe context, volatility regime, cross-asset, calendar,
and (optional) Deribit funding. Same causality contract as features.py: row t uses only data known at
t_known = ts + 1h. Covered by tests/test_no_lookahead.py.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import COINS
from .features import FEATURES as V2, _hourly, _rsi, price_features

FLOW = ["taker_ratio", "taker_ratio_z", "taker_ratio_chg", "trades_z", "qvol_z", "trade_size_z"]
MTF = ["ret_72", "ret_168", "trend_4h", "trend_1d", "dist_hi_1d", "dist_lo_1d", "dist_hi_1w", "dist_lo_1w", "rsi_1d"]
VOLREG = ["rvol_pct", "atr_ratio", "range_comp"]
CROSS = ["rel_btc_72", "btc_ret_1", "btc_ret_4", "corr_btc_168"]
CAL = ["weekend", "session", "hours_to_daily_close"]
FUND = ["funding_1h", "funding_24h", "funding_z"]
GROUPS = {"base": V2, "flow": FLOW, "mtf": MTF, "volreg": VOLREG, "cross": CROSS, "cal": CAL, "fund": FUND}
LOOKBACK_H = 3000   # EWM(480) and RSI(336) need ~5x their span to forget the start


def _z(s: pd.Series, n: int = 168) -> pd.Series:
    return (s - s.rolling(n).mean()) / s.rolling(n).std()


def extra_features(c: pd.DataFrame) -> pd.DataFrame:
    df = price_features(c)
    close, vol = df.close, df.volume
    # order flow
    df["taker_ratio"] = df.taker_buy_base / vol.replace(0, np.nan)
    df["taker_ratio_z"] = _z(df.taker_ratio)
    df["taker_ratio_chg"] = df.taker_ratio.rolling(4).mean() - df.taker_ratio.rolling(24).mean()
    df["trades_z"] = _z(np.log1p(df.trades))
    df["qvol_z"] = _z(np.log1p(df.quote_volume))
    df["trade_size_z"] = _z(np.log1p(df.quote_volume / df.trades.replace(0, np.nan)))
    # multi-timeframe
    df["ret_72"] = close.pct_change(72, fill_method=None)
    df["ret_168"] = close.pct_change(168, fill_method=None)
    df["trend_4h"] = close / close.ewm(span=80, adjust=False).mean() - 1
    df["trend_1d"] = close / close.ewm(span=480, adjust=False).mean() - 1
    df["dist_hi_1d"] = close / df.high.rolling(24).max() - 1
    df["dist_lo_1d"] = close / df.low.rolling(24).min() - 1
    df["dist_hi_1w"] = close / df.high.rolling(168).max() - 1
    df["dist_lo_1w"] = close / df.low.rolling(168).min() - 1
    df["rsi_1d"] = _rsi(close, 14 * 24)
    # volatility regime
    df["rvol_pct"] = df.rvol_24.rolling(720).rank(pct=True)
    prev = close.shift(1)
    tr = pd.concat([df.high - df.low, (df.high - prev).abs(), (df.low - prev).abs()], axis=1).max(axis=1)
    df["atr_ratio"] = tr.ewm(alpha=1 / 14, adjust=False).mean() / tr.ewm(alpha=1 / 168, adjust=False).mean()
    df["range_comp"] = (df.high.rolling(24).max() - df.low.rolling(24).min()) / \
                       (df.high.rolling(168).max() - df.low.rolling(168).min())
    # calendar (t_known = prediction time)
    df["weekend"] = (df.t_known.dt.dayofweek >= 5).astype(int)
    h = df.t_known.dt.hour
    df["session"] = np.select([h < 8, h < 14, h < 21], [0, 1, 2], 3)   # Asia, Europe, US, late
    df["hours_to_daily_close"] = (24 - h) % 24
    df["logret"] = np.log(close).diff()
    return df


def build_v3(candles: dict[str, pd.DataFrame], fng: pd.DataFrame,
             funding: dict[str, pd.DataFrame] | None = None) -> pd.DataFrame:
    per = {coin: extra_features(candles[coin]) for coin in COINS if coin in candles}
    b = per["BTC"]
    btc = pd.DataFrame({"ts": b.ts, "btc_4": b.ret_4, "btc_24": b.ret_24, "btc_72": b.ret_72,
                        "btc_ret_1": b.ret_1, "btc_ret_4": b.ret_4, "btc_logret": b.logret})
    g = fng.sort_values("ts").copy()
    g["fng_chg_7"] = g.fng.diff(7)
    g["avail"] = g.ts + pd.Timedelta(days=1)
    out = []
    for coin, df in per.items():
        df = df.merge(btc, on="ts", how="left")
        if coin == "BTC":
            for col in ["rel_btc_4", "rel_btc_24", "rel_btc_72"]:
                df[col] = 0.0
            df["corr_btc_168"] = 1.0
        else:
            df["rel_btc_4"] = df.ret_4 - df.btc_4
            df["rel_btc_24"] = df.ret_24 - df.btc_24
            df["rel_btc_72"] = df.ret_72 - df.btc_72
            df["corr_btc_168"] = df.logret.rolling(168).corr(df.btc_logret)
        df = pd.merge_asof(df.sort_values("t_known"),
                           g[["avail", "fng", "fng_chg_7"]].rename(columns={"avail": "t_known"}),
                           on="t_known", direction="backward", tolerance=pd.Timedelta(days=3))
        if funding is not None and coin in funding:
            f = funding[coin].sort_values("ts").copy()      # ts = end of the funding hour => known at ts
            f["ts"] = f.ts.astype(df.t_known.dtype)
            f = f.set_index("ts").funding_1h
            f = f.reindex(pd.date_range(f.index.min(), f.index.max(), freq="h"))
            fr = pd.DataFrame({"t_known": f.index, "funding_1h": f.values,
                               "funding_24h": f.rolling(24).mean().values,
                               "funding_z": ((f - f.rolling(720).mean()) / f.rolling(720).std()).values})
            df = pd.merge_asof(df, fr.dropna(subset=["funding_1h"]), on="t_known",
                               direction="backward", tolerance=pd.Timedelta(hours=3))
        else:
            for col in FUND:
                df[col] = np.nan
        df["coin"] = coin
        df["coin_id"] = COINS.index(coin)
        out.append(df.drop(columns=["btc_4", "btc_24", "btc_72", "btc_logret", "logret"]))
    return pd.concat(out, ignore_index=True).dropna(subset=["close"]).reset_index(drop=True)

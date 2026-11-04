"""v3 features: future candles (incl. order-flow fields), future F&G and future funding must not move past features."""
import numpy as np
import pandas as pd
import pytest

from hopium.config import COINS
from hopium.features_v3 import GROUPS, LOOKBACK_H, build_v3

N = 24 * 170
FEATS = [f for g in GROUPS.values() for f in g]


def synthetic(seed=0):
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2025-01-01", periods=N, freq="h", tz="UTC")
    candles, funding = {}, {}
    for i, coin in enumerate(COINS):
        close = 100 * (i + 1) * np.exp(np.cumsum(rng.normal(0, 0.01, N)))
        open_ = np.r_[close[0], close[:-1]]
        spread = np.abs(rng.normal(0, 0.004, N)) * close
        vol = rng.lognormal(10, 0.5, N)
        candles[coin] = pd.DataFrame({"ts": ts, "open": open_, "high": np.maximum(open_, close) + spread,
                                      "low": np.minimum(open_, close) - spread, "close": close, "volume": vol,
                                      "quote_volume": vol * close, "trades": rng.integers(1000, 9000, N).astype(float),
                                      "taker_buy_base": vol * rng.uniform(0.3, 0.7, N)})
        funding[coin] = pd.DataFrame({"ts": ts + pd.Timedelta(hours=1), "funding_1h": rng.normal(1e-5, 1e-5, N)})
    days = pd.date_range("2024-12-01", "2025-07-01", freq="D", tz="UTC")
    fng = pd.DataFrame({"ts": days, "fng": rng.integers(5, 95, len(days)).astype(float)})
    return candles, fng, funding


def perturb(candles, fng, funding, cut, seed=7):
    rng = np.random.default_rng(seed)
    c2, f2 = {}, {}
    for coin, c in candles.items():
        c = c.copy()
        m = c.ts >= cut
        for col in ["open", "high", "low", "close", "volume", "quote_volume", "trades", "taker_buy_base"]:
            c.loc[m, col] = c.loc[m, col] * rng.uniform(0.3, 3, m.sum())
        c2[coin] = c
        f = funding[coin].copy()
        f.loc[f.ts > cut, "funding_1h"] = rng.normal(0, 1e-3, (f.ts > cut).sum())
        f2[coin] = f
    g = fng.copy()
    g.loc[g.ts >= cut.normalize(), "fng"] = rng.integers(0, 100, (g.ts >= cut.normalize()).sum())
    return c2, g, f2


@pytest.mark.parametrize("hours", [900, 2500, 4000])
def test_v3_no_lookahead(hours):
    candles, fng, funding = synthetic()
    cut = candles["BTC"].ts.iloc[0] + pd.Timedelta(hours=hours)
    a = build_v3(candles, fng, funding)
    b = build_v3(*perturb(candles, fng, funding, cut))
    a = a[a.t_known <= cut].sort_values(["coin", "ts"]).reset_index(drop=True)
    b = b[b.t_known <= cut].sort_values(["coin", "ts"]).reset_index(drop=True)
    assert len(a) == len(b) == hours * len(COINS)
    for f in FEATS:
        np.testing.assert_array_equal(a[f].to_numpy(), b[f].to_numpy(), err_msg=f"lookahead in {f}")


def test_v3_live_window_parity():
    candles, fng, funding = synthetic()
    full = build_v3(candles, fng, funding)
    short = build_v3({c: d.tail(LOOKBACK_H) for c, d in candles.items()}, fng, funding)
    for coin in COINS:
        x, y = full[full.coin == coin].iloc[-1], short[short.coin == coin].iloc[-1]
        for f in FEATS:
            assert np.isclose(x[f], y[f], rtol=2e-3, atol=1e-7, equal_nan=True), (coin, f, x[f], y[f])

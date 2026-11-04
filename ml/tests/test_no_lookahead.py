"""Changing FUTURE data must not change any PAST feature value.

Row t is predicted at t_known = ts + 1h. "Future" relative to a cut time T means:
  * any candle that opens at or after T (it closes after T), for any coin (BTC feeds ETH/SOL features)
  * any fear & greed value stamped on or after the UTC day of T (it may be published after T)
Rows with t_known <= T must be bit-for-bit unchanged.
"""
import numpy as np
import pandas as pd
import pytest

from hopium.config import COINS
from hopium.features import FEATURES, build

N = 24 * 30


def synthetic(seed=0):
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2025-01-01", periods=N, freq="h", tz="UTC")
    candles = {}
    for i, coin in enumerate(COINS):
        close = 100 * (i + 1) * np.exp(np.cumsum(rng.normal(0, 0.01, N)))
        open_ = np.r_[close[0], close[:-1]]
        spread = np.abs(rng.normal(0, 0.004, N)) * close
        candles[coin] = pd.DataFrame({"ts": ts, "open": open_, "high": np.maximum(open_, close) + spread,
                                      "low": np.minimum(open_, close) - spread, "close": close,
                                      "volume": rng.lognormal(10, 0.5, N)})
    days = pd.date_range("2024-12-01", "2025-02-15", freq="D", tz="UTC")
    fng = pd.DataFrame({"ts": days, "fng": rng.integers(5, 95, len(days)).astype(float)})
    return candles, fng


def perturb(candles, fng, cut, seed=99):
    rng = np.random.default_rng(seed)
    c2 = {}
    for coin, c in candles.items():
        c = c.copy()
        fut = c.ts >= cut
        k = rng.uniform(0.5, 2.0, fut.sum())
        for col in ["open", "high", "low", "close"]:
            c.loc[fut, col] = c.loc[fut, col] * k
        c.loc[fut, "volume"] = c.loc[fut, "volume"] * rng.uniform(0.1, 10, fut.sum())
        c2[coin] = c
    f2 = fng.copy()
    f2.loc[f2.ts >= cut.normalize(), "fng"] = rng.integers(0, 100, (f2.ts >= cut.normalize()).sum())
    return c2, f2


@pytest.mark.parametrize("hours", [200, 333, 500, 690])
def test_future_changes_do_not_move_past_features(hours):
    candles, fng = synthetic()
    cut = candles["BTC"].ts.iloc[0] + pd.Timedelta(hours=hours)
    a = build(candles, fng)
    b = build(*perturb(candles, fng, cut))
    key = ["coin", "ts"]
    a = a[a.t_known <= cut].sort_values(key).reset_index(drop=True)
    b = b[b.t_known <= cut].sort_values(key).reset_index(drop=True)
    assert len(a) == len(b) == hours * len(COINS)
    for f in FEATURES:
        np.testing.assert_array_equal(a[f].to_numpy(), b[f].to_numpy(), err_msg=f"lookahead in {f}")


def test_perturbation_actually_changes_the_future():
    """Guard against a vacuous test: the perturbed rows after the cut must differ."""
    candles, fng = synthetic()
    cut = candles["BTC"].ts.iloc[0] + pd.Timedelta(hours=300)
    a = build(candles, fng)
    b = build(*perturb(candles, fng, cut))
    fa = a[a.t_known > cut + pd.Timedelta(hours=30)].ret_24.to_numpy()
    fb = b[b.t_known > cut + pd.Timedelta(hours=30)].ret_24.to_numpy()
    assert not np.allclose(fa, fb)


def test_live_window_matches_full_history():
    """predict.py builds features from a short recent window; it must equal the training pipeline's row."""
    LOOKBACK_H = 400  # v2 feature window (v2 features are a subset of v3)
    candles, fng = synthetic()
    full = build(candles, fng)
    short = build({c: d.tail(LOOKBACK_H) for c, d in candles.items()}, fng)
    for coin in COINS:
        x = full[full.coin == coin].iloc[-1]
        y = short[short.coin == coin].iloc[-1]
        for f in FEATURES:
            assert np.isclose(x[f], y[f], rtol=1e-4, atol=1e-9, equal_nan=True), (coin, f, x[f], y[f])

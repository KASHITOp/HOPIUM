"""The live signal rule must equal the research trade rule and the DB constraint `signal_matches_prob` (v3)."""
import numpy as np
import pandas as pd
import pytest

from hopium.engine import regime_cell, signal
from research.harness import regime_cell as harness_cell
from research.harness import trades


@pytest.mark.parametrize("score,sig", [(0.161, "UP"), (0.16, "NO_CALL"), (0.0, "NO_CALL"), (-0.16, "NO_CALL"), (-0.161, "DOWN")])
def test_signal_boundaries_match_db(score, sig):
    # DB: UP iff score > thr; DOWN iff score < -thr; NO_CALL iff -thr <= score <= thr
    assert signal(score, 0.16, "long_short", 0, None) == sig


def test_long_only_never_down():
    assert signal(-0.9, 0.16, "long_only", 0, None) == "NO_CALL"


def test_no_threshold_means_no_call():
    assert signal(0.9, None, "long_short", 0, None) == "NO_CALL"


def test_live_rule_equals_research_rule():
    rng = np.random.default_rng(3)
    n = 400
    df = pd.DataFrame({"coin": "BTC", "ts": pd.date_range("2025-01-01", periods=n, freq="h", tz="UTC"),
                       "fwd_move": rng.normal(0, 0.01, n), "rvol_pct": rng.uniform(0, 1, n),
                       "trend_1d": rng.normal(0, 0.02, n)})
    score = rng.uniform(-0.5, 0.5, n)
    tr = trades(df, score, 1, 0.16, "long_short")        # h=1 => no overlap skipping
    live = [signal(s, 0.16, "long_short", 0, None) for s in score]
    want = {ts: ("UP" if side > 0 else "DOWN") for ts, side in zip(tr.ts, tr.side)}
    assert [want.get(ts, "NO_CALL") for ts in df.ts] == live


def test_regime_cell_matches_research():
    rng = np.random.default_rng(4)
    df = pd.DataFrame({"rvol_pct": rng.uniform(0, 1, 200), "trend_1d": rng.normal(0, 0.02, 200)})
    df.loc[::17, "rvol_pct"] = np.nan
    assert list(harness_cell(df)) == [regime_cell(a, b) for a, b in zip(df.rvol_pct, df.trend_1d)]

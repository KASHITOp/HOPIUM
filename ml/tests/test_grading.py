import math

import numpy as np
import pandas as pd
import pytest

from hopium.features import add_labels
from hopium.grading import grade, label, signal_for


@pytest.mark.parametrize("p,sig", [(0.581, "UP"), (0.58, "NO_CALL"), (0.5, "NO_CALL"), (0.42, "NO_CALL"), (0.419, "DOWN")])
def test_signal_thresholds(p, sig):
    assert signal_for(p) == sig


@pytest.mark.parametrize("signal,entry,exit_,outcome,hit", [
    ("UP", 100, 100.2, "HIT", True),
    ("UP", 100, 99.8, "MISS", False),
    ("DOWN", 100, 99.8, "HIT", True),
    ("DOWN", 100, 100.2, "MISS", False),
    ("UP", 100, 100.09, "FLAT", None),       # +0.09% < 0.1%
    ("DOWN", 100, 99.91, "FLAT", None),
    ("UP", 100, 100.11, "HIT", True),        # just past the boundary (exact 0.1% is FP-ambiguous everywhere)
    ("NO_CALL", 100, 105, "SAT_OUT", None),
])
def test_grade(signal, entry, exit_, outcome, hit):
    g = grade(signal, entry, exit_)
    assert g["outcome"] == outcome and g["hit"] is hit
    assert g["move"] == pytest.approx((exit_ - entry) / entry)


def test_training_label_equals_grading():
    """The training target and the live grader must agree on every move."""
    rng = np.random.default_rng(1)
    for m in rng.normal(0, 0.003, 5000):
        g = grade("UP", 100.0, 100.0 * (1 + m))
        y = label(g["move"])
        if g["outcome"] == "FLAT":
            assert math.isnan(y)
        else:
            assert y == (1.0 if g["hit"] else 0.0)


def test_add_labels_uses_close_at_target():
    ts = pd.date_range("2025-01-01", periods=6, freq="h", tz="UTC")
    df = pd.DataFrame({"ts": ts, "coin": "BTC", "close": [100, 101, 100.05, 99, 99, 98]})
    out = add_labels(df, 1)
    assert out.fwd_move.iloc[0] == pytest.approx(0.01)
    assert out.y.iloc[0] == 1.0
    assert math.isnan(out.y.iloc[3])          # 99 -> 99 is flat
    assert math.isnan(out.fwd_move.iloc[-1])  # no future candle yet

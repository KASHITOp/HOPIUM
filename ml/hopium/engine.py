"""v3 live engine: the shipped artifact and the single signal rule.

A bundle (ml/models/engine_v3.pkl) holds everything needed to reproduce a live call:
  model        fitted multiclass model, predict_proba -> [P(BIG_DOWN), P(NOTHING), P(BIG_UP)]
  config       research.harness.Config as a dict (h, k, model, groups, sides, regime, ...)
  threshold    score threshold chosen on inner validation (score = P(BIG_UP) - P(BIG_DOWN))
  cells        regime cells allowed to trade (None = all)
  version      model_version string

Signal rule (identical in research/harness.trades, here, and the DB constraint `signal_matches_score`):
  UP      if score >  threshold (and the regime cell is allowed)
  DOWN    if score < -threshold and sides == long_short (and the regime cell is allowed)
  NO_CALL otherwise
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .features_v3 import GROUPS


def regime_cell(rvol_pct: float, trend_1d: float) -> int:
    """6 cells: volatility tercile x trend sign. Mirrors research.harness.regime_cell."""
    v = int(np.digitize([0.5 if pd.isna(rvol_pct) else rvol_pct], [1 / 3, 2 / 3])[0])
    t = int((0.0 if pd.isna(trend_1d) else trend_1d) > 0)
    return v * 2 + t


def features_of(config: dict) -> list[str]:
    return [f for g in config["groups"] for f in GROUPS[g]]


def signal(score: float, threshold: float, sides: str, cell: int, cells) -> str:
    if threshold is None:
        return "NO_CALL"
    allowed = cells is None or cell in cells
    if allowed and score > threshold:
        return "UP"
    if allowed and sides == "long_short" and score < -threshold:
        return "DOWN"
    return "NO_CALL"


def predict_row(bundle: dict, row: pd.Series) -> dict:
    cfg = bundle["config"]
    X = pd.DataFrame([row])[features_of(cfg)]
    p_down, p_nothing, p_up = (float(x) for x in np.asarray(bundle["model"].predict_proba(X))[0])
    score = p_up - p_down
    cell = regime_cell(row.get("rvol_pct"), row.get("trend_1d"))
    return {"p_big_up": p_up, "p_big_down": p_down, "p_nothing": p_nothing, "score": score,
            "signal": signal(score, bundle["threshold"], cfg["sides"], cell, bundle["cells"]), "cell": cell}

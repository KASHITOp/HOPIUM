"""The ONE definition of a move, a training label and a grade.

Mirrors the `outcome_matches_move` constraint in supabase/schema.sql and web/lib/grading.ts.
"""
from __future__ import annotations

import math

from .config import DOWN_THRESHOLD, FLAT_THRESHOLD, UP_THRESHOLD


def move(entry: float, exit_: float) -> float:
    return (exit_ - entry) / entry


def label(m: float) -> float:
    """Training target: 1 = up, 0 = down, NaN = flat (excluded)."""
    if m is None or math.isnan(m) or abs(m) < FLAT_THRESHOLD:
        return math.nan
    return 1.0 if m > 0 else 0.0


def signal_for(prob_up: float) -> str:
    if prob_up > UP_THRESHOLD:
        return "UP"
    if prob_up < DOWN_THRESHOLD:
        return "DOWN"
    return "NO_CALL"


def grade(signal: str, entry: float, exit_: float) -> dict:
    m = move(entry, exit_)
    if signal == "NO_CALL":
        outcome, hit = "SAT_OUT", None
    elif abs(m) < FLAT_THRESHOLD:
        outcome, hit = "FLAT", None
    else:
        hit = (m > 0) if signal == "UP" else (m < 0)
        outcome = "HIT" if hit else "MISS"
    return {"price_at_target": exit_, "move": m, "outcome": outcome, "hit": hit}

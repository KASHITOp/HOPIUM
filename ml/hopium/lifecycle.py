"""Prediction lifecycle timestamps and the versioned late-run rule (trust v1).

Sources, stated honestly:
  candle_close_time  market reference time (hour boundary). Not system activity.
  job_started_at     APPLICATION-REPORTED (runner clock)
  input_cutoff_at    APPLICATION-REPORTED: newest input datum the features used (= close of the last closed candle)
  generated_at       APPLICATION-REPORTED: model output computed
  inserted_at        DATABASE-GENERATED (trigger forces now()); rows are publicly readable from this moment via RLS,
                     so it is also the earliest observable publication time. Not independently witnessed.
  target_time        outcome horizon end = grading eligibility time
  graded_at          DATABASE-GENERATED
Nothing here is independently witnessed.
"""
from __future__ import annotations

import os

import pandas as pd

from .config import MAX_LATE_MINUTES

APP_SAFETY_MIN = 2
LATE_RULE = f"late-v1:skip>{MAX_LATE_MINUTES - APP_SAFETY_MIN}m-app/reject>{MAX_LATE_MINUTES}m-db"
TRUST_COLUMNS = ("provenance", "job_started_at", "input_cutoff_at", "generated_at", "run_id", "late_rule")


def eligible(close: pd.Timestamp, at: pd.Timestamp) -> tuple[bool, str | None]:
    """Late-run rule v1. Returns (eligible, skip_reason). Boundary: exactly 18.0 min late is still eligible."""
    late = (at - close).total_seconds() / 60
    if late < 0:
        return False, "before_candle_close"
    if late > MAX_LATE_MINUTES - APP_SAFETY_MIN:
        return False, f"late:{late:.1f}m>{MAX_LATE_MINUTES - APP_SAFETY_MIN}m"
    return True, None


def run_id() -> str | None:
    rid = os.environ.get("GITHUB_RUN_ID")
    return f"{rid}/{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}" if rid else None


def stamp(row: dict, job_started_at: pd.Timestamp, generated_at: pd.Timestamp, input_cutoff_at: pd.Timestamp) -> dict:
    if not (input_cutoff_at <= pd.Timestamp(row["candle_close_time"]) and job_started_at <= generated_at):
        raise ValueError("lifecycle timestamps out of order")
    return row | {"provenance": "live_prospective", "job_started_at": job_started_at.isoformat(),
                  "input_cutoff_at": input_cutoff_at.isoformat(), "generated_at": generated_at.isoformat(),
                  "run_id": run_id(), "late_rule": LATE_RULE}


def strip(rows: list[dict]) -> list[dict]:
    """Rows without trust columns, for a database where migration 20261105000000 is not applied yet."""
    return [{k: v for k, v in r.items() if k not in TRUST_COLUMNS} for r in rows]

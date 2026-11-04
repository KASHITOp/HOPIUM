"""Read-only database setup check. Issues GET requests and one read-only RPC; never inserts, updates or deletes.

Writes ml/ops/db_check.json. Run by .github/workflows/db-check.yml.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
OUT = Path(__file__).resolve().parent.parent / "ops" / "db_check.json"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

EXPECTED_COLUMNS = {
    "predictions": ["id", "coin", "horizon", "prob_up", "signal", "price_at_call", "candle_close_time", "inserted_at",
                    "created_at", "target_time", "model_version", "price_at_target", "move", "outcome", "hit", "graded_at"],
    "run_log": ["id", "job", "candle_close_time", "status", "detail", "logged_at"],
    "model_runs": ["model_version", "trained_at", "oos_accuracy", "oos_n", "brier", "baseline_accuracy", "calibration",
                   "feature_importance", "backtest_equity", "details"],
    "candles_cache": ["coin", "open_time", "o", "h", "l", "c", "v"],
}
EXPECTED_CONSTRAINTS = {
    "predictions": ["predictions_pkey", "predictions_coin_horizon_candle_close_time_key", "candle_on_the_hour",
                    "target_matches_horizon", "inserted_on_time", "inserted_after_close", "signal_matches_prob",
                    "grading_complete", "hit_matches_outcome", "move_matches_prices", "outcome_matches_move"],
    "run_log": ["run_log_pkey"], "model_runs": ["model_runs_pkey"], "candles_cache": ["candles_cache_pkey"],
}
EXPECTED_TRIGGERS = {"predictions": ["predictions_bd", "predictions_bi", "predictions_bt", "predictions_bu"]}
WRITE_PRIVS = {"INSERT", "UPDATE", "DELETE", "TRUNCATE"}


def main() -> int:
    res = {"checked_at": datetime.now(timezone.utc).isoformat(), "checks": [], "ok": False}

    def check(name, passed, detail=""):
        res["checks"].append({"check": name, "pass": bool(passed), "detail": detail})

    if not URL or not KEY:
        check("secrets present", False, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")
        return finish(res)
    check("secrets present", True)
    # 1) tables + columns via PostgREST OpenAPI (read-only)
    r = requests.get(f"{URL}/rest/v1/", headers=H, timeout=30)
    check("REST reachable with service key", r.ok, f"HTTP {r.status_code}")
    defs = r.json().get("definitions", {}) if r.ok else {}
    for t, cols in EXPECTED_COLUMNS.items():
        have = set((defs.get(t) or {}).get("properties", {}))
        missing = [c for c in cols if c not in have]
        check(f"table {t} + columns", t in defs and not missing, f"missing: {missing}" if missing else "")
    # 2) catalog report (constraints, triggers, RLS, policies, anon grants) via read-only RPC
    r = requests.post(f"{URL}/rest/v1/rpc/hopium_schema_report", headers=H | {"Content-Type": "application/json"},
                      json={}, timeout=30)
    if r.status_code == 404:
        check("hopium_schema_report() installed", False,
              "run supabase/migrations/20261104010000_schema_report.sql to enable catalog checks")
        return finish(res)
    check("hopium_schema_report() installed", r.ok, f"HTTP {r.status_code} {r.text[:200]}" if not r.ok else "")
    if not r.ok:
        return finish(res)
    rep = r.json()
    res["report"] = rep
    tables = rep.get("tables") or {}
    for t in EXPECTED_COLUMNS:
        info = tables.get(t) or {}
        check(f"{t}: RLS enabled", info.get("rls_enabled") is True)
        pols = info.get("policies") or []
        sel = [p for p in pols if p["cmd"] == "r" and set(p["roles"] or []) >= {"anon", "authenticated"}]
        writes = [p for p in pols if p["cmd"] != "r"]
        check(f"{t}: public SELECT policy only", bool(sel) and not writes, f"policies: {pols}")
        bad = sorted(WRITE_PRIVS & set(info.get("anon_privileges") or []))
        check(f"{t}: anon has no write privileges", not bad, f"anon can: {bad}" if bad else "")
        miss = [c for c in EXPECTED_CONSTRAINTS.get(t, []) if c not in (info.get("constraints") or [])]
        check(f"{t}: constraints", not miss, f"missing: {miss}" if miss else "")
        miss = [c for c in EXPECTED_TRIGGERS.get(t, []) if c not in (info.get("triggers") or [])]
        if t in EXPECTED_TRIGGERS:
            check(f"{t}: immutability triggers", not miss, f"missing: {miss}" if miss else "")
    return finish(res)


def finish(res) -> int:
    res["ok"] = all(c["pass"] for c in res["checks"])
    res["passed"] = sum(c["pass"] for c in res["checks"])
    res["total"] = len(res["checks"])
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(res, indent=1, default=str))
    print(json.dumps({k: v for k, v in res.items() if k != "report"}, indent=1))
    return 0   # the result file is the signal; the workflow must still commit it


if __name__ == "__main__":
    sys.exit(main())

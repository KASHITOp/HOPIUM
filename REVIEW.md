# HOPIUM review and decision log

Decisions taken autonomously, newest last. Each entry: what, why, evidence.

| Date (UTC) | Decision | Why / evidence |
|---|---|---|
| 2026-11-04 | Spot candles from `data-api.binance.vision`; `api.binance.com` and Binance/Bybit futures not used live | Probe run #1 from a GitHub runner: 200 vs 451/403 (ml/DATA.md) |
| 2026-11-04 | Deribit funding approved as live feature group `fund` | Probe run #1: Deribit 200 from US runner; owner approved |
| 2026-11-04 | Open interest stays out | No public OI history on any reachable source; can't train on it honestly |
| 2026-11-04 | Final holdout = label windows reaching 2026-05-01 or later; excluded in code (`research/harness.py`), evaluated once by `research/holdout.py` with a lock file | Brief section 4 |
| 2026-11-04 | Trade thresholds, regime cells and hyperparameters chosen on the last 90 days of each training window (nested), never on the test month | Brief section 3 |
| 2026-11-04 | Workflow results are written to `ml/ops/*.json` and committed back by the workflow; read via git pull | GitHub API tool unreliable in this environment |
| 2026-11-04 | Workflows map secret `SUPABASE_SERVICE_ROLE_KEY` to env `SUPABASE_SERVICE_KEY` | Owner named the secret SUPABASE_SERVICE_ROLE_KEY |
| 2026-11-04 | DB verification = PostgREST OpenAPI (tables/columns) + read-only `hopium_schema_report()` RPC (constraints, triggers, RLS, anon grants). No test inserts | A test insert into `predictions` could never be deleted (by design), so behavioural probes on prod are unsafe |
| 2026-11-04 | db-check blocked: no Supabase secret reaches GitHub Actions | ml/ops/db_check.json (09:2x UTC): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_KEY all empty in the job. Needs repository-level Actions secrets on KASHITOp/HOPIUM. Waiting on owner (secrets are owner-only) |
| 2026-11-04 | Workflows read secrets `SUPABASE_PROJECT_LINK` and `SUPABASE_ROLE_SERVICE_KEY` (owner's exact names); `db.normalize_url` accepts API URL, dashboard link or bare ref | Owner's screenshot of Actions > Repository secrets |

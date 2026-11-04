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
| 2026-11-04 | db-check 6/7: secrets OK, REST 200, all 4 tables with expected columns. Catalog checks pending `hopium_schema_report()` (migration 20261104010000) | ml/ops/db_check.json |
| 2026-11-04 | Workflows accept either secret pair: SUPABASE_URL or SUPABASE_PROJECT_LINK; SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ROLE_SERVICE_KEY | Owner's brief and screenshot named them differently |
| 2026-11-04 | DB verified 24/24 (tables, columns, constraints, immutability triggers, RLS, SELECT-only public policies, no anon writes) | ml/ops/db_check.json |
| 2026-11-04 | Final config = a2dedaa2 (12h, k=1%, logreg, all groups incl. funding, long+short) | Pre-agreed rule: best net @0.2% among >=150 trades, >=2/3 coins positive, majority of years positive. Only 9 of 39 configs qualified; this one +91.0% walk-forward |
| 2026-11-04 | Deribit funding kept | Removing it: walk-forward +91.0% -> +42.8% (stage2 A no-funding) |
| 2026-11-04 | Holdout run once: 0 trades, net 0.0% => ship rule C "Does not beat trading fees in testing." | Threshold picked on Feb-Apr 2026 found nothing profitable, so the model sat out all of 2026-05-01..2026-11-03 |
| 2026-11-04 | Live bundle v3-12h-logreg-20261104 trained on all data, threshold 0.16 from the last 90 days (protocol), fallback not needed | Live product needs forward evidence; disclosed in RESULTS.md that this threshold used holdout-period data and is not a holdout result |
| 2026-11-04 | Live engine predicts the 12h horizon only (one model) | Only the chosen config ships; 1h/4h v2 models retired |
| 2026-11-04 | Migration 20261104020000_engine_v3.sql (additive): 12h horizon, p_big_up/p_big_down/score/threshold/k, score-based signal constraint, immutability covers new columns. 31/31 PGlite schema tests | Needed so the DB enforces the v3 signal rule exactly like ml/hopium/engine.py |
| 2026-11-04 | Grading unchanged: v3 calls are graded as direction calls (move > 0 for UP, < 0 for DOWN, FLAT if abs(move) < 0.1%); k only defines the training target | The call is a direction; profit after fees is shown separately per receipt |
| 2026-11-04 | Hourly + retrain workflows commit ml/ops/last_predict.json / last_grade.json and model artifacts back to the branch | Owner instruction: read workflow results via git |

## SQL I must run

1. `supabase/migrations/20261104020000_engine_v3.sql` in the Supabase SQL editor. Until then the live predict job
   logs a constraint error every hour (nothing bad is written). db-check will report the new columns as missing.
| 2026-11-04 | Merged claude/hopium-engine-v3 into main with a merge commit via git (no force push) | GitHub API tool returned 'invalid session' for create_pull_request; owner pre-approved the merge |

## WAITING ON KARTAVYAA

0. **Approve Vercel access for the `kartavyaas-projects` scope.** The Vercel connection gets 403 on the existing `hopium`
   project until you approve the consent link I sent in chat (single use, 10 minutes; I can generate a new one). Fallback:
   follow `VERCEL_SETUP.md` by hand.

1. **Run `supabase/migrations/20261104020000_engine_v3.sql` in the Supabase SQL editor.** db-check (09:33 UTC) shows
   `predictions` is missing p_big_up, p_big_down, score, threshold, k. Until this runs, every hourly predict attempt fails
   with a schema error (logged in run_log and ml/ops/last_predict.json); nothing invalid can be written.

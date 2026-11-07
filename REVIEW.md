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

1. DONE (applied by owner, db-check 24/24): `supabase/migrations/20261104020000_engine_v3.sql`. Until then the live predict job
   logs a constraint error every hour (nothing bad is written). db-check will report the new columns as missing.
| 2026-11-04 | Merged claude/hopium-engine-v3 into main with a merge commit via git (no force push) | GitHub API tool returned 'invalid session' for create_pull_request; owner pre-approved the merge |

## WAITING ON KARTAVYAA

Nothing right now. (Vercel scope approved; migration 0003 applied, both verified.)

## E3 hard-ban checklist (checked against the code with grep + visual review of every page)

| Ban | Result |
|---|---|
| harsh gradients | pass (none; slips are flat colour + noise PNG) |
| lucide or any stock icon set | pass (components/Icons.tsx, hand-drawn) |
| white or light backgrounds | pass (lightest colour on the site is #D6CEBD text) |
| rainbow colours | pass (9-token palette only) |
| drop shadows | pass (none; separation by rules and spacing) |
| 3 feature cards in a row | fixed (coins are ledger rows, not cards) |
| emojis | pass (0 found) |
| glassmorphism / blur | pass |
| em dashes in site copy | pass (0 found) |
| Inter, Geist, Space Grotesk | pass (Bricolage Grotesque + IBM Plex Mono only, self-hosted) |
| coloured left stripe on cards | pass |
| fake testimonials / user counts | pass |
| bento grids | pass |
| fake terminal windows | pass |
| "It's not X, it's Y" copy | pass |
| checkmark bullet lists | pass |
| pricing tiers | pass (no pricing) |
| stock product images | pass (real receipts are the demo) |
| soft rounded corners | pass (radius 0 to 2px in Tailwind config) |
| purple | pass (removed with the old prototype) |
| missing skeleton loaders | pass (receipt-shaped skeletons on home, receipts, portfolio, lab) |
| radial orbs / blobs, dot grids | pass |
| sparkle icons, bouncing arrows | pass |
| missing Terms / Privacy | pass (/terms, /privacy, /disclaimer) |
| decorative hover lifts / scales | pass (hover changes underline only) |
| neon or glow | pass |
| pastel palettes | pass |
| banned words (AI-powered, revolutionary, unlock, supercharge, seamless, game-changer, sure-shot, guaranteed) | pass (0 found) |
| any white or light background | pass |
| any glow / neon on dark | pass |

## WCAG AA contrast (computed; scratchpad script, WCAG 2.1 relative luminance)

| Text colour | on #13120F counter | on #1E1C18 slip | Use |
|---|---|---|---|
| ink #D6CEBD | 11.97 | 10.87 | body text |
| faded #8F897C | 5.39 | 4.89 | secondary text |
| red #D4614C (from #D25A44) | 5.01 | 4.55 | misses, DOWN, alerts |
| green #6FA27E | 6.37 | 5.79 | hits, UP |
| blue #7D9BCB | 6.62 | 6.01 | links, focus ring |
| pencil #6E695F | 3.43 | 3.12 | stamps and large UI only (3:1) |
| pencilText #898377 (pencil hue, lighter) | 4.97 | 4.52 | small pencil text |

Fixes: stamp red #D25A44 measured 4.28:1 on slip, lightened within its hue to #D4614C. Pencil #6E695F is below 4.5:1, so
small text uses #898377 and #6E695F is kept for stamps (large, decorative). Rule #3A362E is for lines only, never text.

## Lighthouse (mobile, production https://hopium-phi.vercel.app, Lighthouse 12.2.1, headless Chromium)

Production build 13cbd1d (self-hosted fonts). The price-strip CLS fix (983a657, CLS 0.18 -> 0 measured locally) is
merged to main but not yet deployed: Vercel's free-tier deployment cap for the day was reached. It deploys with the next
push to main that touches web/.

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| / | 91 | 100 | 96 | 100 | 2.0 s | 0.182 |
| /receipts | 91 | 100 | 96 | 100 | 2.1 s | 0.182 |
| /how-it-works | 100 | 100 | 96 | 100 | 1.9 s | 0.023 |
| /portfolio | 91 | 100 | 96 | 100 | 1.8 s | 0.182 |
| /lab | 91 | 100 | 96 | 100 | 1.9 s | 0.182 |
| /case-study | 91 | 100 | 96 | 100 | 1.8 s | 0.18 |
| /terms | 100 | 100 | 96 | 100 | 1.8 s | 0.023 |

Earlier build (Google Fonts stylesheet): /receipts 83 performance; fixed by next/font/local.

Decision: Vercel ignored-build-step now builds only `main` and `demo`, and only when `web/` changed (branch pushes and
hourly bot commits were burning the free deployment quota).

## FINAL REPORT

- **Live URL:** https://hopium-phi.vercel.app (production, public). Demo preview with labelled DEMO DATA:
  https://hopium-git-demo-kartavyaas-projects.vercel.app (Vercel login required; previews are protected).
- **Model label: C, "Does not beat trading fees in testing."** Chosen config a2dedaa2 (12h, k = 1%, logistic regression,
  all live features incl. Deribit funding, long + short). Walk-forward Sep 2024 to Apr 2026: +91.0% after 0.2% fees,
  988 trades, win rate 49.8%, Sharpe 1.27 (95% CI 0.02 to 2.50), max drawdown 23.1%. Locked holdout May to Nov 2026:
  0 trades, net 0.0%. Rule C because holdout net P&L <= 0. 39 configs tried.
- **What is live:** hourly predict + grade + candle cache from main (cron at :02, plus a manual kick via ml/ops/run-now);
  late starts are skipped and logged (verified: 10:00 candle skipped at 22.1 min); weekly retrain with leakage gate;
  keepalive; db-check (24/24). Website on Vercel bom1 reading Supabase with the publishable key.
- **What is mocked:** nothing on production. The `demo` branch preview runs on DEMO DATA and says so on every page.
- **SQL still to run:** none.
- **Things to click:** none required. Optional: enable Vercel Web Analytics in the project settings (the Privacy Policy
  already discloses it; the script is installed but only records once enabled).
- **Known limitations:** the model's edge faded in 2026, so most hours print NO CALL; GitHub cron can start late, which
  produces "printer jammed" hours by design; Vercel free tier limits deployments per day; Deribit open interest has no
  history, so OI is not a feature; share images fetch IBM Plex Mono from Google at render time and fall back to the
  default font if that fails.
- **Next 3 things:** (1) run an always-on collector (e.g. a Mumbai-region edge function) for exchange funding and open
  interest so a real history accumulates; (2) after 60+ days of live receipts, compare live calibration with walk-forward
  and retire or re-select the config by the same pre-registered rule; (3) add regime detection trained across more than
  one market cycle before trusting any trading edge.

**Resume bullet (3 lines):**
Built HOPIUM, a public crypto forecaster whose every prediction is stored before its outcome and graded automatically;
Postgres constraints and triggers make receipts immutable and reject late or rule-breaking inserts. Ran 39 configurations
through nested walk-forward validation with a locked 6-month holdout, and published the result honestly: it does not beat fees.

**LinkedIn (2 sentences):**
I built HOPIUM, a crypto direction forecaster that publishes every call before the outcome and grades itself in public,
with Python, GitHub Actions, Supabase and Next.js. Its walk-forward backtest beat trading fees, the untouched 6-month holdout
did not, and the site says exactly that.

## Live verification (2026-11-04)

| Check | Result | Evidence |
|---|---|---|
| Late run skipped and logged | pass: 10:00 candle, started 22.1 min late, status missed, nothing inserted | ml/ops/last_predict.json @ 10:22 |
| First live predictions | pass: ids 1-3 (BTC/ETH/SOL 12h, all NO_CALL, scores +0.025/+0.029/+0.035 vs 0.16), inserted 2.2 min after the 11:00 close | ml/ops/last_predict.json @ 11:02 |
| Idempotency | pass: re-run for the 11:00 candle at 4.2 min inserted 0, already_existed 3 | ml/ops/last_predict.json @ 11:04 |
| Site shows live rows | pass: receipts #1-#3 on / and in /receipts/csv | production HTML |
| First grading | pending: target_time 23:00 UTC; any hourly run after that grades them (grade.py runs every hour) | to verify next session |

## Scheduler: GitHub cron did not fire (2026-11-04)

- hourly.yml has been on the default branch (main) of a public repo since 09:33 UTC with `cron: "2 * * * *"`. By 13:21 UTC
  GitHub had created **0** runs with event `schedule` (Actions API: all 3 runs were `push`). No error is shown anywhere;
  GitHub documents that scheduled events can be delayed or dropped and gives no SLA.
- Decision: keep the cron (it costs nothing if it starts working) and add `.github/workflows/heartbeat.yml`, a
  self-chaining fallback: sleep until HH:02, dispatch hourly.yml, dispatch itself. Only one chain runs at a time, and it
  retires as soon as a `schedule` run appears in the last 3 hours. Manual kick via ml/ops/run-now stays as a last resort.

## Final session additions (2026-11-04)

- Home: "Why it's sitting out" panel (ink gauge per coin: lean = P(big up) minus P(big down), hatched no-call band at
  +/-0.16, copy such as "BTC lean +0.03. Needs 0.16 to call. Not even close."), and an activity counter (hours watched,
  calls made out of coin-hours, printer jams) since the first live receipt.
- Receipts: when nothing is graded, an empty state gives the first grading time in the visitor's local time instead of empty charts.
- /maker page (owner's copy verbatim), "Maker" in the nav, "Printed by Kartavyaa Patel" in the footer, case-study byline,
  /maker share image, README "About the maker".
- Share images now 1200x627 (LinkedIn's recommended size); home image carries the honest headline stamp
  "DOES NOT BEAT TRADING FEES IN TESTING". Verified locally: both render 200, PNG 1200x627.
- Ban checklist on all new elements: pass (no em dashes, emojis, banned words, gradients, shadows, rounded corners,
  stock icons; the three new link icons are hand-drawn glyphs, not brand logos). Contrast: new elements reuse the tokens
  already measured above (ink, faded, red 5.01:1 on counter, green 5.79:1 on slip): pass.
- Checks: web lint clean, typecheck clean, 36 Vitest tests, production build OK; ml 34 pytest; supabase 31 schema tests.

### Lighthouse after the CLS fix went live (mobile, production 909ba29)

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| / | 97 | 96 (definition-list markup in the new counter; fixed in the next deploy) | 96 | 100 | 2.1 s | 0 |
| /receipts | 99 | 100 | 96 | 100 | 2.2 s | 0 |
| /maker | 100 | 100 | 96 | 100 | 1.9 s | 0 |

CLS went from 0.182 to 0 on Home and Receipts once the reserved-height price strip deployed.

## Trust v1, phase 1 (branch trust-v1)

| Date (UTC) | Decision | Why / evidence |
|---|---|---|
| 2026-11-04 | Legacy rows keep `provenance` NULL and show as "live (pre-provenance label)" | Brief: never assume unknown origin; only the predict job writes the table, so they stay in live metrics, labelled weaker |
| 2026-11-04 | `predictions.provenance` may only be `live_prospective` | Demo/backtest can't enter the live table at all |
| 2026-11-04 | predict.py retries without trust-v1 columns on PGRST204 | So the hourly job keeps working until migration 20261105000000 is applied |
| 2026-11-04 | +91.0% relabelled, not recomputed | Brief: don't change past results. Execution-convention backtest marked unavailable |

## SQL I must run (trust v1)

1. `supabase/migrations/20261105000000_trust_v1.sql` in the Supabase SQL editor (additive; no rows touched).


## Status at end of final session (2026-11-04 14:05 UTC)

**Verified live**
- Hourly predict through the heartbeat fallback: 14:02 heartbeat dispatched hourly.yml; 14:00 candle rows 7-9 inserted
  2.8 min after close; heartbeat run #2 dispatched itself (event workflow_dispatch by github-actions[bot]).
- Late-run skip (10:00 candle), idempotency (11:00 re-run inserted 0), site serving live rows.
- Production deploy 909ba29+ includes sit-out gauges, activity counter, receipts empty state, /maker, credits,
  1200x627 share images; CLS 0 on Home, Receipts, Maker (Lighthouse mobile).
- Combined main after PR #1 (trust v1): web lint/typecheck clean, 49 Vitest, build OK; ml 44 pytest; supabase 40 schema tests.

**Pending**
- First grading of rows #1-3 at 23:00 UTC: a check-in is scheduled for 23:20 UTC to verify price_at_target, outcome
  (SAT_OUT expected, all three were NO_CALL) and graded_at, and record it here.
- GitHub's own `schedule` trigger: still 0 events. The heartbeat retires itself automatically if it ever starts.
- Trust v1 migration `supabase/migrations/20261105000000_trust_v1.sql` (from PR #1) is waiting to be run by the owner.

**Next 3 improvements**
1. Always-on collector for exchange funding and open interest (e.g. a Mumbai-region edge function), so a real history
   exists to train on.
2. After 60+ days of live receipts, compare live calibration against walk-forward and re-select by the same
   pre-registered rule.
3. Move the scheduler off GitHub entirely (Supabase pg_cron calling a workflow_dispatch webhook) once a scoped token
   can be stored as a Supabase secret.

## Incident: site looked stalled (diagnosed 2026-11-05 13:20 UTC)

- **Heartbeat chain died at 16:02 UTC on 11-04.** Run #3 (15:02) lingered until 16:22 after dispatching run #4; run #4's
  "only one chain" guard saw #3 still in progress and stopped, ending the chain. Fix: guard removed; concurrency group
  `heartbeat` (max one running + one pending, extras collapse); next heartbeat queued in an `if: always()` step with
  retries; every hourly run re-arms the heartbeat; a `17,47 * * * *` cron on heartbeat acts as a watchdog. The
  "retire when schedule works" rule is gone: GitHub's schedule fired only 3 times in 20 h (17:49, 23:23, 05:44), all late.
- **Hours covered:** predict ok at 11:00, 14:00, 15:00, 16:00; logged missed at 10:00, 17:00, 23:00, 05:00 (started 22 to
  50 min late). Hours with no job at all (e.g. 12:00, 13:00, 18:00 to 22:00) have no run_log row; they were never
  backfilled. Ids 4 to 6 do not exist (sequence values consumed by inserts that failed before trust v1 was applied).
- **Stale pages:** production had not been redeployed since 11-04 (Vercel free-tier 402); live pages are now
  `force-dynamic` and DB fetches cache at most 60 s, so the site cannot show a build-time snapshot again.
- **Grading verified:** rows 1-3 graded at 23:23, rows 7-15 at 05:45. All 12 rows re-checked against Binance 1h closes
  (data-api.binance.vision): entry, exit, move and outcome match exactly (12/12). Row 14 (ETH UP, 16:00) moved -0.065%
  and is correctly FLAT; the rest are NO_CALL, so SAT_OUT.
- Footer and receipts copy no longer say "the database refuses edits"; they say triggers reject edits and the database
  owner could still change rows.

## WAITING ON KARTAVYAA (optional, recommended): external hourly trigger via Supabase pg_cron

GitHub-only chaining is now self-healing, but it still runs on GitHub's infrastructure. An independent trigger:

1. GitHub > Settings > Developer settings > Fine-grained tokens > Generate: repository access **only KASHITOp/HOPIUM**,
   permission **Actions: Read and write**, nothing else. Do not paste it into chat.
2. Supabase SQL editor, run (paste the token where shown, inside the SQL editor only):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('PASTE_TOKEN_HERE', 'github_dispatch_token');
select cron.schedule('hopium-hourly-dispatch', '1 * * * *', $job$
  select net.http_post(
    url := 'https://api.github.com/repos/KASHITOp/HOPIUM/actions/workflows/hourly.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_dispatch_token'),
      'Accept', 'application/vnd.github+json', 'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'hopium-pgcron'),
    body := '{"ref":"main"}'::jsonb);
$job$);
```

3. Check after the next hour: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 3;`
   and `select status_code, created from net._http_response order by created desc limit 3;` (expect 204).
   Remove with `select cron.unschedule('hopium-hourly-dispatch');`. Duplicate dispatches are harmless (DB idempotency).
| 2026-11-05 | Stamps legible: opacity 0.85 -> 0.95, sizes +10%, lighter ink texture, grey stamps #6E695F -> #898377 (4.5:1 on slip), stamp moved to its own row beside the barcode so it never overlaps text; share image stamp in flow, 0.95 opacity | Owner: DEAD MONEY on /r/14 too faint |

## Phase 2 (trust-v2), 2026-11-05: all four priority items done

| Date (UTC) | Decision | Why / evidence |
|---|---|---|
| 2026-11-05 | Witness = OpenTimestamps (`ots stamp` of the hourly chain head; .ots proofs committed to `ml/ops/witness/`) | Probe from a GitHub runner, `ml/ops/witness_probe.json` 15:31 UTC: a.pool 200, finney 200, b.pool unreachable, client stamp OK. Rekor 200 but needs a signing identity; not used |
| 2026-11-05 | Hash chain linked by the DATABASE (trigger computes hash, seq, prev, link under an advisory lock) | Application cannot choose chain position; append-only. 24 new PGlite tests (64 total) |
| 2026-11-05 | Rows stored before the chain existed are committed at activation with `committed_at` = that moment; never shown as witnessed earlier | Brief: never claim pre-existing records were witnessed |
| 2026-11-05 | Registry source of truth is `ml/models/registry.json` (git-reviewed); weekly retrain appends an entry; DB copy immutable | Current bundle sha256 checked by test |
| 2026-11-05 | Coverage schedule sched-v1 starts at the first live reference close; no maintenance windows declared | Ledger derived from public tables only |
| 2026-11-05 | Corrections via GitHub issue template only; resolutions are append-only `corrections` rows | No public form, no spam surface |
| 2026-11-05 | Demo data note: verifier flags demo receipts whose stored `move` was computed from unrounded prices (live DB enforces 1e-9, so live rows cannot have this). Left as is: demo only | `tools/verify_receipt.py` on mock /r/3 |

Checks run on trust-v2: web vitest 61 passed, tsc clean, lint clean, `next build` OK; ml pytest 55 passed;
supabase PGlite 64 passed. Smoke test in mock mode: /, /coverage, /models, /r/1, /r/1/evidence all 200.

Not done in phase 2 (next session): WS6 dependence-aware intervals, WS7 calibration by version, WS12 copy pass on
remaining pages. Concurrent chain writes are protected by an advisory lock but not exercised by a multi-connection test.

## WAITING ON KARTAVYAA

1. **Run in the Supabase SQL editor:** `supabase/migrations/20261105100000_trust_v2.sql` (additive: 4 new tables,
   triggers, read-only RLS; touches no existing row). Until then the site shows the hash chain and witness as
   "not configured" and the hourly job skips those steps. After it runs, the next hourly job commits every existing
   prediction to the chain, stamps the head with OpenTimestamps and registers the model; the home page then shows the
   exact witnessing activation time. Check: `select count(*) from commitments; select * from witness_receipts;`

## 2026-11-07 ~21:10 UTC: "chain died after 14:00" investigated; pg_cron made primary

- **Finding: the chain did not die.** Git ops log (`ml/ops/last_predict.json` per commit) shows every candle stored,
  ids contiguous: 14:00 #166-168, 15:00 #169-171, 16:00 #172-174, 17:00 #178-180, 18:00 #181-183, 19:00 #184-186,
  20:00 #187-189, 21:00 #190-192, each inserted ~2.5 min after close. Actions: hourly runs #71-#75 all success.
  Two harmless extras: 16:11 re-run (inserted 0, idempotent) and GitHub's own `schedule` firing 42 min late at
  20:42 (status `missed`, rejected by the late rule). Site pages are `force-dynamic` with <=60 s fetch cache, so a
  7.5 h lag cannot come from the site; the "newest #166-168" view was a stale tab/screenshot or a different
  Supabase project (the only project visible to the Supabase connector, `tppcqtgb...`, is INACTIVE and not HOPIUM).
  No run-now was triggered: the chain was healthy and a run at 21:10 would only log `missed`.
- **Primary scheduler is now Supabase pg_cron** (`supabase/migrations/20261107220000_pg_cron_trigger.sql`): HH:01
  `workflow_dispatch` of hourly.yml, token read from Vault secret `github_dispatch_token` at run time. Heartbeat
  (HH:02) stays as backup; overlap is absorbed by the `hourly` concurrency group + DB unique key. Supersedes the
  inline SQL in "external hourly trigger via Supabase pg_cron" above.
- **OpenTimestamps:** `witness.py` already runs `ots upgrade` on every proof each hour. Checked: 52/54 proofs carry
  `BitcoinBlockHeaderAttestation`; the 2 pending are the newest (chain-177/180), normal for <~6 h old. No change.

# HOPIUM trust notes (trust-v1, phase 1)

Status words: **implemented** (code exists), **tested** (a test exercises it), **planned** (not built).

## Audit findings

| Issue | Evidence in repository | Risk | Fix (phase 1) | Tests |
|---|---|---|---|---|
| No provenance on rows; legacy rows indistinguishable from labelled ones | `predictions` had no origin column; demo only separated by deploy mode (`lib/data.ts`) | Demo/backtest could be read as live | `provenance` column restricted to `live_prospective`; NULL = legacy, never relabelled; `liveOnly()` in the live adapter; env label on home, receipts, receipt page, portfolio, CSV | PGlite: demo/backtest insert rejected; vitest: demo rows don't move tally or portfolio |
| Demo deployment said "since the first live receipt" | `components/SitOut.tsx` | Synthetic timestamps read as real | Says DEMO in mock mode | build + manual |
| Only candle time and DB insert time exist | schema: `candle_close_time`, `inserted_at`, `graded_at` | Market reference time read as system activity | App-reported `job_started_at`, `input_cutoff_at`, `generated_at`, `run_id`, `late_rule`; ordering CHECK; receipt timeline labels each clock | PGlite ordering + immutability; pytest late-rule boundaries; vitest ordering |
| Backtest and paper portfolio enter at the reference close | `research/harness.py trades()`, `lib/portfolio.ts` | Close was already past when the forecast existed: not a fill | Reference-close book relabelled; separate `exec-v1` simulation (next close after `inserted_at`), unavailable when candles are missing | vitest fill + unavailable |
| Direction hit, big-move event and profit blurred | Receipt showed HIT plus net only | A +0.15% "hit" loses money | `lib/outcomes.ts`: three verdicts with denominators/exclusions on receipts page and each receipt | vitest boundaries (0.1% flat strict, k strict, net 0 not profitable) |
| +91.0% unlabelled | home aside, how-it-works, case study | Read as account growth | Methodology panel: compounded 3 fixed sleeves, no rebalance, one trade per coin, reference-close entry, 0.2% fees only, sum of trade returns = +201.0% shown for contrast | vitest reconciliation, overlap, compounding, short, costs |
| Daily equity books each trade on its entry day | `harness.portfolio` uses `t.ts.dt.ceil("D")` | Drawdown/Sharpe timing slightly optimistic; final figure unaffected | Disclosed, not recomputed | none (disclosure only) |
| Config chosen on walk-forward results of 39 configs | REVIEW.md selection rule | "Test month never helps pick anything" overstated | Copy says the walk-forward figure is a selected result | n/a |
| Absolute claims | case-study "impossible to edit", "cannot fake a receipt", "cannot be overfit"; how-it-works "90% is a lie", "51% to 57%" | Unsupported guarantees | Rewritten to the guarantees DB rules actually give; owner can still change them | grep |
| Wall of Shame looks like the record | receipts page | Selection mistaken for the record | Says it's a hand-picked subset; links ledger and CSV | manual |
| Hit-rate significance assumes independence | `luckSentence` binomial test | Overlapping 12h windows and correlated coins | Labelled descriptive (proper fix: phase 2, WS6) | n/a |

## Timestamp sources

| Field | Meaning | Clock |
|---|---|---|
| `candle_close_time` | scheduled slot = reference candle close | market reference |
| `input_cutoff_at` | newest input datum used | application-reported |
| `job_started_at`, `generated_at` | job start, model output computed | application-reported |
| `inserted_at` | stored; publicly readable via RLS from this moment (earliest observable publication) | database (trigger) |
| `target_time` | outcome horizon end = grading eligibility | rule |
| `graded_at` | graded | database |

None are independently witnessed. Legacy rows have NULL for the application-reported fields: unknown, never backfilled.
Late-run rule `late-v1`: the job skips if more than 18.0 min after the close (18.0 exactly is eligible); the database
rejects inserts more than 20 min after the close.

## What the database rules do and don't do

Implemented and tested (PGlite): no edits to the prediction payload, provenance or lifecycle fields; grade once, only after
`target_time`; no deletes or truncate; anon is SELECT-only. Not prevented: anyone with the database owner or service-role
key can drop triggers or constraints. There is no hash chain or independent witness yet (planned, WS10).

# Trust v2 (phase 2)

## WS10 Tamper evidence: implemented, tested; witness active only once the migration is applied

**Scheme `hopium-pred-v1`** (`ml/hopium/commit.py`, twin `web/lib/commit.ts`, shared test vector).
Canonical text = JSON with sorted keys and no whitespace; every value is a string or null. Numbers: 12 fixed decimals,
trailing zeros removed (`70123.45` serialises as the exact double, `70123.449999999997`). Timestamps:
`YYYY-MM-DDTHH:MM:SS.ffffffZ`, UTC only. Fields: id, coin, horizon, signal, prob_up, p_big_up, p_big_down, score,
threshold, k, price_at_call, candle_close_time, target_time, inserted_at, model_version, provenance, job_started_at,
input_cutoff_at, generated_at, run_id, late_rule. Grading columns are excluded (they are set later and re-derivable
from public Binance candles). A scheme change gets a new name; old commitments keep theirs.

**Chain.** `payload_hash = sha256(canonical)`, `chain_hash = sha256(prev_hash + payload_hash)`, first prev = 64 zeros.
The hourly job reads each new row back through the public API, serialises it and inserts it into `commitments`.
The database recomputes the hash, checks the text describes that prediction, takes an advisory lock, assigns a gapless
`seq` and computes the link itself; the table is append-only (update/delete/truncate rejected). Concurrent writers are
serialised by the lock; duplicates are rejected by `unique(prediction_id)` (retries are no-ops).

**Witness.** Each hour the chain head is written to `ml/ops/witness/chain-<seq>.txt` and stamped with OpenTimestamps
(`ots stamp`; public calendars aggregate into Bitcoin). The `.ots` proof is committed to git; every attempt, failures
included, is a `witness_receipts` row. Chosen after a probe from a GitHub runner (`ml/ops/witness_probe.json`,
2026-11-05 15:31 UTC): OpenTimestamps a.pool 200, finney 200, b.pool unreachable, `ots stamp` succeeded; Rekor 200
but needs a signing identity, so not used. Check a proof: `pip install opentimestamps-client`, then
`ots verify ml/ops/witness/chain-<n>.txt.ots` (Bitcoin attestations appear after `ots upgrade`, a few hours later).

| Protection | Status |
|---|---|
| Edited payload, deleted/reordered/duplicated link fails verification | tested (pytest, vitest, PGlite) |
| DB recomputes hash and links; client cannot choose prev_hash/seq | tested (PGlite) |
| Concurrent writers | implemented (advisory lock); PGlite is single-connection so not exercised concurrently |
| Witness failure visible and retried | implemented (failed rows, hourly retry); tested only at the DB level |

**What it proves.** After a commitment exists, changing that row's payload, or removing/reordering commitments, is
detectable by anyone holding an earlier chain head. Once a head is OpenTimestamps-stamped, the operator cannot rewrite
anything at or before it without the Bitcoin attestation failing.
**What it does not prove.** The operator (database owner) can still drop triggers and rewrite the whole chain before the
next stamp, or withhold a prediction before it is committed (window: up to one hour). Self-reported times stay
self-reported. Rows stored before the chain started were committed when the feature went live; their `committed_at`
shows that, and they are not witnessed before then. **Witnessing active since:** the first `submitted` row in
`witness_receipts` (shown on the home page). Before migration 20261105100000 is applied it is "not configured".

## WS9 Coverage ledger: implemented, tested (`web/lib/coverage.ts`, page `/coverage`)

Schedule `sched-v1`: one prediction per coin (BTC, ETH, SOL) at every UTC hour close, from the first live reference
close to the latest closed hour; no planned maintenance declared. Each slot's state is derived from public tables only:
row present -> published (graded / pending, NO CALL graded / pending); else `run_log` for that hour: `missed` ->
skipped late (rule late-v1), `error` or `ok` without that coin's row -> failed; no log at all -> missing, no job ran
(scheduler gap); inside the 20-minute window -> in progress (excluded from the denominator). Coverage % = published /
settled expected slots, independent of accuracy. Consecutive missing hours with the same state merge into intervals.
Retries cannot duplicate slots (DB unique key on coin/horizon/close; the ledger keys by slot). The 2026-11-04/05
scheduler outage (REVIEW.md incident) appears as `no_job` and `late_skipped` intervals. Nothing is backfilled.

## WS8 Model and rule registry: implemented, tested (`ml/models/registry.json`, `ml/hopium/registry.py`, `/models`)

Each entry: version, artifact sha256 (checked against the file before registering), code commit, feature schema,
training period and cutoff, decision rule, grading rule, change kind (initial / automatic retrain under an unchanged
procedure / procedure change), reason, research artifacts. `activated_at` is filled once from the first live row's
database insert time. The DB table rejects edits and deletes except filling activation/retirement once (PGlite tests).
The weekly retrain appends a new entry (code commit = the workflow's `GITHUB_SHA`) and classifies it by comparing
feature groups and the decision-rule form with the previous entry. Each receipt links to `/models#<version>`;
per-version live records are never pooled. Versions seen in predictions without an entry are shown as unregistered.

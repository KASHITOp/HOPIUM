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

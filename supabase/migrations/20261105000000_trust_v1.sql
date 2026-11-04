-- Trust v1: provenance + lifecycle timestamps. ADDITIVE ONLY: no existing row is updated or deleted.
-- Existing rows keep provenance = NULL, which the site shows as "legacy (pre-provenance)". They are NOT relabelled.
-- Reversible: drop the added columns/constraints and re-run 20261104020000_engine_v3.sql's trigger function.

-- Provenance. The predictions table only ever holds rows written by the live predict job, so the only allowed
-- label is 'live_prospective'. Demo and backtest data live elsewhere (web/lib/mock.ts, ml/research/*) and cannot
-- be inserted here, which keeps them out of live metrics at the database level.
alter table public.predictions add column if not exists provenance text;
alter table public.predictions drop constraint if exists provenance_is_live;
alter table public.predictions add constraint provenance_is_live check (provenance is null or provenance = 'live_prospective');

-- Lifecycle timestamps (UTC). All four are APPLICATION-REPORTED by the GitHub Actions job (runner clock), not
-- witnessed. inserted_at (database clock, forced by trigger) and graded_at (database clock) remain the only
-- database-generated times. NULL on legacy rows = unknown; never backfilled.
alter table public.predictions add column if not exists job_started_at  timestamptz;  -- predict job start
alter table public.predictions add column if not exists input_cutoff_at timestamptz;  -- newest input datum used (= candle close)
alter table public.predictions add column if not exists generated_at    timestamptz;  -- model output computed
alter table public.predictions add column if not exists run_id          text;         -- GitHub Actions run id/attempt
alter table public.predictions add column if not exists late_rule       text;         -- e.g. 'late-v1:18m-app/20m-db'

-- Ordering checks. 2 minutes of tolerance for runner-vs-database clock skew.
alter table public.predictions drop constraint if exists lifecycle_order;
alter table public.predictions add constraint lifecycle_order check (
  (input_cutoff_at is null or input_cutoff_at <= candle_close_time)
  and (job_started_at is null or job_started_at >= candle_close_time - interval '2 minutes')
  and (generated_at is null or (generated_at >= candle_close_time - interval '2 minutes'
                                and generated_at <= inserted_at + interval '2 minutes'))
  and (job_started_at is null or generated_at is null or job_started_at <= generated_at + interval '2 minutes'));

-- Immutability now also covers provenance and lifecycle columns.
create or replace function public.predictions_before_update() returns trigger
language plpgsql as $$
begin
  if old.graded_at is not null then
    raise exception 'prediction % is already graded; receipts are final', old.id;
  end if;
  if (new.id, new.coin, new.horizon, new.prob_up, new.signal, new.price_at_call, new.candle_close_time,
      new.inserted_at, new.target_time, new.model_version, new.p_big_up, new.p_big_down, new.score, new.threshold, new.k,
      new.provenance, new.job_started_at, new.input_cutoff_at, new.generated_at, new.run_id, new.late_rule)
     is distinct from
     (old.id, old.coin, old.horizon, old.prob_up, old.signal, old.price_at_call, old.candle_close_time,
      old.inserted_at, old.target_time, old.model_version, old.p_big_up, old.p_big_down, old.score, old.threshold, old.k,
      old.provenance, old.job_started_at, old.input_cutoff_at, old.generated_at, old.run_id, old.late_rule) then
    raise exception 'prediction % is immutable; only grading columns may be set', old.id;
  end if;
  if now() < old.target_time then
    raise exception 'prediction % cannot be graded before target_time', old.id;
  end if;
  new.graded_at := now();
  return new;
end $$;

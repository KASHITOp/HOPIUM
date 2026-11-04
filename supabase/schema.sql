-- HOPIUM schema
-- Public read-only (RLS). Writes only via the service_role key held in GitHub Actions secrets.
-- Rules enforced by the database itself, not by application code:
--   * predictions are immutable after insert, except the grading columns, which can be set exactly once
--   * inserted_at is stamped by the server and must be within 20 minutes of candle_close_time
--   * no grading before target_time; no deletes

create table if not exists public.predictions (
  id                bigint generated always as identity primary key,
  coin              text not null check (coin in ('BTC', 'ETH', 'SOL')),
  horizon           text not null check (horizon in ('1h', '4h')),
  prob_up           double precision not null check (prob_up >= 0 and prob_up <= 1),
  signal            text not null check (signal in ('UP', 'DOWN', 'NO_CALL')),
  price_at_call     double precision not null check (price_at_call > 0),  -- close of last CLOSED 1h candle
  candle_close_time timestamptz not null,                                   -- e.g. 14:00:00 UTC
  inserted_at       timestamptz not null default now(),                    -- forced to now() by trigger
  created_at        timestamptz generated always as (inserted_at) stored,
  target_time       timestamptz not null,
  model_version     text not null,
  -- grading columns (set once by grade.py)
  price_at_target   double precision,
  move              double precision,                                      -- (exit - entry) / entry
  outcome           text check (outcome in ('HIT', 'MISS', 'FLAT', 'SAT_OUT')),
  hit               boolean,                                               -- null for FLAT and SAT_OUT
  graded_at         timestamptz,

  unique (coin, horizon, candle_close_time),
  constraint candle_on_the_hour check (date_trunc('hour', candle_close_time) = candle_close_time),
  constraint target_matches_horizon check (
    target_time = candle_close_time + case horizon when '1h' then interval '1 hour' else interval '4 hours' end),
  constraint inserted_on_time check (inserted_at <= candle_close_time + interval '20 minutes'),
  constraint inserted_after_close check (inserted_at >= candle_close_time),
  constraint signal_matches_prob check (
    (signal = 'UP' and prob_up > 0.58) or (signal = 'DOWN' and prob_up < 0.42)
    or (signal = 'NO_CALL' and prob_up >= 0.42 and prob_up <= 0.58)),
  constraint grading_complete check (
    (graded_at is null and price_at_target is null and move is null and outcome is null and hit is null)
    or (graded_at is not null and price_at_target is not null and move is not null and outcome is not null)),
  constraint hit_matches_outcome check (
    outcome is null
    or (outcome = 'HIT' and hit) or (outcome = 'MISS' and not hit)
    or (outcome in ('FLAT', 'SAT_OUT') and hit is null)),
  -- Grading semantics, identical to ml/grading.py and web/lib/grading.ts:
  -- move = (exit - entry) / entry; |move| < 0.1% => FLAT; UP hit if move > 0; DOWN hit if move < 0.
  constraint move_matches_prices check (
    move is null or abs(move - (price_at_target - price_at_call) / price_at_call) < 1e-9),
  constraint outcome_matches_move check (
    outcome is null
    or (signal = 'NO_CALL' and outcome = 'SAT_OUT')
    or (signal <> 'NO_CALL' and abs(move) < 0.001 and outcome = 'FLAT')
    or (signal = 'UP'   and move >=  0.001 and outcome = 'HIT')
    or (signal = 'UP'   and move <= -0.001 and outcome = 'MISS')
    or (signal = 'DOWN' and move <= -0.001 and outcome = 'HIT')
    or (signal = 'DOWN' and move >=  0.001 and outcome = 'MISS'))
);
create index if not exists predictions_target_idx on public.predictions (target_time) where graded_at is null;
create index if not exists predictions_close_idx on public.predictions (candle_close_time desc);

create or replace function public.predictions_before_insert() returns trigger
language plpgsql as $$
begin
  new.inserted_at := now();          -- the client cannot choose its own timestamp
  if new.graded_at is not null then
    raise exception 'predictions must be inserted ungraded';
  end if;
  return new;
end $$;

create or replace function public.predictions_before_update() returns trigger
language plpgsql as $$
begin
  if old.graded_at is not null then
    raise exception 'prediction % is already graded; receipts are final', old.id;
  end if;
  if (new.id, new.coin, new.horizon, new.prob_up, new.signal, new.price_at_call, new.candle_close_time,
      new.inserted_at, new.target_time, new.model_version)
     is distinct from
     (old.id, old.coin, old.horizon, old.prob_up, old.signal, old.price_at_call, old.candle_close_time,
      old.inserted_at, old.target_time, old.model_version) then
    raise exception 'prediction % is immutable; only grading columns may be set', old.id;
  end if;
  if now() < old.target_time then
    raise exception 'prediction % cannot be graded before target_time', old.id;
  end if;
  new.graded_at := now();
  return new;
end $$;

create or replace function public.hopium_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'HOPIUM receipts cannot be deleted';
end $$;

drop trigger if exists predictions_bi on public.predictions;
create trigger predictions_bi before insert on public.predictions
  for each row execute function public.predictions_before_insert();
drop trigger if exists predictions_bu on public.predictions;
create trigger predictions_bu before update on public.predictions
  for each row execute function public.predictions_before_update();
drop trigger if exists predictions_bd on public.predictions;
create trigger predictions_bd before delete on public.predictions
  for each row execute function public.hopium_no_delete();
drop trigger if exists predictions_bt on public.predictions;
create trigger predictions_bt before truncate on public.predictions
  for each statement execute function public.hopium_no_delete();

-- One row per scheduled hour and job. "missed" = cron started too late, prediction skipped (never backfilled).
create table if not exists public.run_log (
  id                bigint generated always as identity primary key,
  job               text not null check (job in ('predict', 'grade', 'retrain')),
  candle_close_time timestamptz,
  status            text not null check (status in ('ok', 'missed', 'error')),
  detail            text,
  logged_at         timestamptz not null default now()
);
create unique index if not exists run_log_predict_once
  on public.run_log (job, candle_close_time) where job = 'predict' and status in ('ok', 'missed');
create index if not exists run_log_time_idx on public.run_log (logged_at desc);

create table if not exists public.model_runs (
  model_version      text primary key,
  trained_at         timestamptz not null,
  oos_accuracy       double precision not null,
  oos_n              integer not null,
  brier              double precision not null,
  baseline_accuracy  jsonb not null,   -- {coin_flip, always_up, same_as_last_candle}
  calibration        jsonb not null,
  feature_importance jsonb not null,
  backtest_equity    jsonb not null,
  details            jsonb             -- per-horizon metrics, confident-call stats, P&L summary
);

create table if not exists public.candles_cache (
  coin      text not null check (coin in ('BTC', 'ETH', 'SOL')),
  open_time timestamptz not null,
  o double precision not null, h double precision not null, l double precision not null,
  c double precision not null, v double precision not null,
  primary key (coin, open_time)
);

-- RLS: anon/authenticated may SELECT only. No write policies exist, so only service_role can write.
alter table public.predictions   enable row level security;
alter table public.run_log       enable row level security;
alter table public.model_runs    enable row level security;
alter table public.candles_cache enable row level security;

do $$
declare t text;
begin
  foreach t in array array['predictions', 'run_log', 'model_runs', 'candles_cache'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Read-only schema self-report for the db-check workflow. Reads system catalogs only; writes nothing.
-- Callable by service_role only (not anon / authenticated).
create or replace function public.hopium_schema_report()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with t as (
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('predictions', 'run_log', 'model_runs', 'candles_cache')
  )
  select jsonb_build_object(
    'tables', (select jsonb_object_agg(t.relname, jsonb_build_object(
        'rls_enabled', t.relrowsecurity,
        'constraints', (select coalesce(jsonb_agg(conname order by conname), '[]') from pg_constraint where conrelid = t.oid),
        'triggers', (select coalesce(jsonb_agg(tgname order by tgname), '[]') from pg_trigger where tgrelid = t.oid and not tgisinternal),
        'policies', (select coalesce(jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd,
                       'roles', (select jsonb_agg(rolname) from pg_roles where oid = any(polroles))) order by polname), '[]')
                     from pg_policy where polrelid = t.oid),
        'anon_privileges', (select coalesce(jsonb_agg(privilege_type order by privilege_type), '[]')
                            from information_schema.role_table_grants
                            where table_schema = 'public' and table_name = t.relname and grantee = 'anon'),
        'row_estimate', (select reltuples::bigint from pg_class where oid = t.oid)
      )) from t),
    'functions', (select coalesce(jsonb_agg(proname order by proname), '[]') from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and proname like any (array['predictions_%', 'hopium_%'])),
    'server_version', current_setting('server_version'),
    'checked_at', now()
  );
$$;

revoke all on function public.hopium_schema_report() from public, anon, authenticated;
grant execute on function public.hopium_schema_report() to service_role;
-- Engine v3: 3-class "fee-sized move" model, 12h horizon, score/threshold signal rule.
-- Additive only: no rows are touched or deleted.

alter table public.predictions add column if not exists p_big_up   double precision check (p_big_up   between 0 and 1);
alter table public.predictions add column if not exists p_big_down double precision check (p_big_down between 0 and 1);
alter table public.predictions add column if not exists score      double precision check (score between -1 and 1);
alter table public.predictions add column if not exists threshold  double precision check (threshold between 0 and 1);
alter table public.predictions add column if not exists k          double precision check (k > 0 and k < 0.2);

-- horizons
alter table public.predictions drop constraint if exists predictions_horizon_check;
alter table public.predictions add constraint predictions_horizon_check check (horizon in ('1h', '4h', '12h', '24h'));
alter table public.predictions drop constraint if exists target_matches_horizon;
alter table public.predictions add constraint target_matches_horizon check (
  target_time = candle_close_time + case horizon when '1h' then interval '1 hour' when '4h' then interval '4 hours'
                                                 when '12h' then interval '12 hours' else interval '24 hours' end);

-- signal rule: v2 rows (score is null) keep the 0.58/0.42 probability rule;
-- v3 rows: UP iff score > threshold, DOWN iff score < -threshold, else NO_CALL; score = p_big_up - p_big_down;
-- prob_up stores p_big_up for v3 rows.
alter table public.predictions drop constraint if exists signal_matches_prob;
alter table public.predictions add constraint signal_matches_prob check (
  (score is null and (
     (signal = 'UP' and prob_up > 0.58) or (signal = 'DOWN' and prob_up < 0.42)
     or (signal = 'NO_CALL' and prob_up >= 0.42 and prob_up <= 0.58)))
  or (score is not null and p_big_up is not null and p_big_down is not null and threshold is not null and k is not null
      and abs(score - (p_big_up - p_big_down)) < 1e-6 and abs(prob_up - p_big_up) < 1e-6
      and p_big_up + p_big_down <= 1 + 1e-6
      and ((signal = 'UP' and score > threshold) or (signal = 'DOWN' and score < -threshold)
           or (signal = 'NO_CALL' and score >= -threshold and score <= threshold))));

-- immutability now covers the new columns
create or replace function public.predictions_before_update() returns trigger
language plpgsql as $$
begin
  if old.graded_at is not null then
    raise exception 'prediction % is already graded; receipts are final', old.id;
  end if;
  if (new.id, new.coin, new.horizon, new.prob_up, new.signal, new.price_at_call, new.candle_close_time,
      new.inserted_at, new.target_time, new.model_version, new.p_big_up, new.p_big_down, new.score, new.threshold, new.k)
     is distinct from
     (old.id, old.coin, old.horizon, old.prob_up, old.signal, old.price_at_call, old.candle_close_time,
      old.inserted_at, old.target_time, old.model_version, old.p_big_up, old.p_big_down, old.score, old.threshold, old.k) then
    raise exception 'prediction % is immutable; only grading columns may be set', old.id;
  end if;
  if now() < old.target_time then
    raise exception 'prediction % cannot be graded before target_time', old.id;
  end if;
  new.graded_at := now();
  return new;
end $$;

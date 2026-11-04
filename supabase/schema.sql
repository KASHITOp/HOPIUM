-- HOPIUM schema. Public read-only; writes only with the service_role key (GitHub Actions).
create table if not exists public.predictions (
  id            bigint generated always as identity primary key,
  coin          text not null check (coin in ('BTC','ETH','SOL')),
  horizon_h     int  not null check (horizon_h in (1,4)),
  prob_up       double precision not null check (prob_up between 0 and 1),
  signal        text not null check (signal in ('UP','DOWN','NO-CALL')),
  price_at_call double precision not null,
  candle_ts     timestamptz not null,           -- open time of the last closed candle used
  created_at    timestamptz not null default now(),
  target_time   timestamptz not null,
  model_version text not null,
  unique (coin, horizon_h, candle_ts)
);
create index if not exists predictions_target_idx on public.predictions (target_time);
create index if not exists predictions_created_idx on public.predictions (created_at desc);

-- Outcomes live in their own table so predictions are never touched after insert.
create table if not exists public.outcomes (
  prediction_id  bigint primary key references public.predictions(id),
  price_at_target double precision not null,
  fwd_ret        double precision not null,
  actual         text not null check (actual in ('UP','DOWN','FLAT')),
  hit            boolean,          -- null for NO-CALL or FLAT ("push")
  model_correct  boolean,          -- p>0.5 vs actual, null if FLAT
  graded_at      timestamptz not null default now()
);

-- Immutability: block UPDATE/DELETE on predictions and outcomes for everyone, service role included.
create or replace function public.hopium_immutable() returns trigger language plpgsql as $$
begin raise exception 'HOPIUM receipts are immutable (% on %)', tg_op, tg_table_name; end $$;
drop trigger if exists predictions_immutable on public.predictions;
create trigger predictions_immutable before update or delete on public.predictions
  for each row execute function public.hopium_immutable();
drop trigger if exists outcomes_immutable on public.outcomes;
create trigger outcomes_immutable before update or delete on public.outcomes
  for each row execute function public.hopium_immutable();

alter table public.predictions enable row level security;
alter table public.outcomes enable row level security;
drop policy if exists "public read" on public.predictions;
create policy "public read" on public.predictions for select to anon, authenticated using (true);
drop policy if exists "public read" on public.outcomes;
create policy "public read" on public.outcomes for select to anon, authenticated using (true);
-- No insert/update/delete policies => only service_role (bypasses RLS) can write.

create or replace view public.graded with (security_invoker = true) as
  select p.*, o.price_at_target, o.fwd_ret, o.actual, o.hit, o.model_correct, o.graded_at
  from public.predictions p left join public.outcomes o on o.prediction_id = p.id;
grant select on public.graded to anon, authenticated;

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

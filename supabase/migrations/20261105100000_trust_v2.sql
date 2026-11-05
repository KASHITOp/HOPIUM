-- Trust v2: tamper evidence (hash chain + witness log), coverage slots, model registry, corrections.
-- ADDITIVE ONLY: new tables, functions and policies. No existing row is updated or deleted; predictions untouched.
-- Reversible: drop the tables/functions created below.

-- ---------- 1. Hash chain over prediction payloads (scheme hopium-pred-v1, see docs/TRUST.md) ----------
-- The predict job reads each new prediction back through the public REST API, serialises it canonically
-- (sorted keys, every value a string or null, fixed number/time formats) and inserts that text here.
-- The database checks the hash and links the chain itself, so the application cannot choose prev_hash/seq.
create table if not exists public.commitments (
  seq           bigint primary key,                       -- assigned by trigger, gapless, under a lock
  prediction_id bigint not null unique references public.predictions(id),
  scheme        text not null check (scheme = 'hopium-pred-v1'),
  canonical     text not null,
  payload_hash  text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash     text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  chain_hash    text not null check (chain_hash ~ '^[0-9a-f]{64}$'),
  committed_at  timestamptz not null default now()        -- database clock; NOT a witnessed time
);

create or replace function public.commitments_before_insert() returns trigger
language plpgsql as $$
declare prev record; p record; j jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('hopium_chain'));   -- serialises concurrent writers
  if new.payload_hash is distinct from encode(sha256(convert_to(new.canonical, 'UTF8')), 'hex') then
    raise exception 'payload_hash does not match canonical text';
  end if;
  j := new.canonical::jsonb;
  select * into p from public.predictions where id = new.prediction_id;
  if j->>'id' is distinct from new.prediction_id::text or j->>'coin' is distinct from p.coin
     or j->>'signal' is distinct from p.signal or j->>'model_version' is distinct from p.model_version
     or j->>'horizon' is distinct from p.horizon then
    raise exception 'canonical payload does not describe prediction %', new.prediction_id;
  end if;
  select seq, chain_hash into prev from public.commitments order by seq desc limit 1;
  new.seq := coalesce(prev.seq, 0) + 1;
  new.prev_hash := coalesce(prev.chain_hash, repeat('0', 64));
  new.chain_hash := encode(sha256(convert_to(new.prev_hash || new.payload_hash, 'UTF8')), 'hex');
  new.committed_at := now();
  return new;
end $$;
drop trigger if exists commitments_before_insert on public.commitments;
create trigger commitments_before_insert before insert on public.commitments
  for each row execute function public.commitments_before_insert();

create or replace function public.append_only() returns trigger
language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;
drop trigger if exists commitments_no_change on public.commitments;
create trigger commitments_no_change before update or delete on public.commitments
  for each row execute function public.append_only();
drop trigger if exists commitments_no_truncate on public.commitments;
create trigger commitments_no_truncate before truncate on public.commitments
  for each statement execute function public.append_only();

-- ---------- 2. Independent witness log (OpenTimestamps). Failures are rows too, so they are visible. ----------
create table if not exists public.witness_receipts (
  id           bigint generated always as identity primary key,
  chain_seq    bigint not null references public.commitments(seq),
  chain_hash   text not null,
  service      text not null check (service in ('opentimestamps')),
  status       text not null check (status in ('submitted', 'failed', 'upgraded')),
  receipt_path text,                                       -- .ots file in the git repo (ml/ops/witness/)
  detail       text,
  logged_at    timestamptz not null default now()
);
create or replace function public.witness_before_insert() returns trigger
language plpgsql as $$
begin
  if new.chain_hash is distinct from (select chain_hash from public.commitments where seq = new.chain_seq) then
    raise exception 'chain_hash does not match commitment %', new.chain_seq;
  end if;
  new.logged_at := now();
  return new;
end $$;
drop trigger if exists witness_before_insert on public.witness_receipts;
create trigger witness_before_insert before insert on public.witness_receipts
  for each row execute function public.witness_before_insert();
drop trigger if exists witness_no_change on public.witness_receipts;
create trigger witness_no_change before update or delete on public.witness_receipts
  for each row execute function public.append_only();

-- ---------- 3. Model and rule registry (append-only; retired versions stay) ----------
create table if not exists public.model_registry (
  model_version     text primary key,
  artifact_sha256   text check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  code_commit       text,
  feature_schema    text,
  training_period   text,
  training_cutoff   timestamptz,
  decision_rule     text not null,
  grading_rule      text not null,
  change_kind       text not null check (change_kind in ('initial', 'retrain_same_procedure', 'procedure_change')),
  change_reason     text not null,
  research_artifacts text,
  activated_at      timestamptz,   -- first live prediction with this version (from predictions, not self-reported)
  retired_at        timestamptz,
  registered_at     timestamptz not null default now()
);
create or replace function public.registry_before_update() returns trigger
language plpgsql as $$
begin
  -- only activated_at / retired_at may be filled in, once each
  if (new.model_version, new.artifact_sha256, new.code_commit, new.feature_schema, new.training_period,
      new.training_cutoff, new.decision_rule, new.grading_rule, new.change_kind, new.change_reason,
      new.research_artifacts, new.registered_at) is distinct from
     (old.model_version, old.artifact_sha256, old.code_commit, old.feature_schema, old.training_period,
      old.training_cutoff, old.decision_rule, old.grading_rule, old.change_kind, old.change_reason,
      old.research_artifacts, old.registered_at)
     or (old.activated_at is not null and new.activated_at is distinct from old.activated_at)
     or (old.retired_at is not null and new.retired_at is distinct from old.retired_at) then
    raise exception 'model_registry row % is immutable except first activation/retirement', old.model_version;
  end if;
  return new;
end $$;
drop trigger if exists registry_before_update on public.model_registry;
create trigger registry_before_update before update on public.model_registry
  for each row execute function public.registry_before_update();
drop trigger if exists registry_no_delete on public.model_registry;
create trigger registry_no_delete before delete on public.model_registry
  for each row execute function public.append_only();

-- ---------- 4. Corrections: new linked records; the original prediction is never touched ----------
create table if not exists public.corrections (
  id            bigint generated always as identity primary key,
  prediction_id bigint not null references public.predictions(id),
  issue_url     text not null check (issue_url ~ '^https://github\.com/'),
  status        text not null check (status in ('open', 'rejected', 'corrected')),
  summary       text not null,
  corrected_outcome text check (corrected_outcome in ('HIT', 'MISS', 'FLAT', 'SAT_OUT')),
  logged_at     timestamptz not null default now()
);
drop trigger if exists corrections_no_change on public.corrections;
create trigger corrections_no_change before update or delete on public.corrections
  for each row execute function public.append_only();

-- ---------- RLS: public SELECT only ----------
do $$
declare t text;
begin
  foreach t in array array['commitments', 'witness_receipts', 'model_registry', 'corrections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

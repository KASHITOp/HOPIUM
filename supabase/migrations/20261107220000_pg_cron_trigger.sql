-- PRIMARY hourly scheduler: Supabase pg_cron + pg_net call GitHub workflow_dispatch for hourly.yml at HH:01 UTC.
-- Backup: .github/workflows/heartbeat.yml keeps dispatching at HH:02. Duplicates are harmless: hourly.yml runs in the
-- `hourly` concurrency group and the DB rejects duplicate (coin, horizon, candle_close_time) rows (already_existed>0).
-- Prerequisite (run once, by hand, NOT committed):
--   select vault.create_secret('<TOKEN>', 'github_dispatch_token', 'GitHub fine-grained PAT: HOPIUM Actions rw');
-- Re-runnable: unschedules any previous copy first. Token is read from Vault at every run, never stored here.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.hopium_dispatch_hourly() returns bigint
language plpgsql security definer set search_path = '' as $$
declare tok text; req bigint;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
  if tok is null then raise exception 'vault secret github_dispatch_token missing'; end if;
  select net.http_post(
    url     := 'https://api.github.com/repos/KASHITOp/HOPIUM/actions/workflows/hourly.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'hopium-pgcron',
      'Content-Type', 'application/json'),
    body    := '{"ref":"main"}'::jsonb,
    timeout_milliseconds := 10000) into req;
  return req;
end $$;
revoke all on function public.hopium_dispatch_hourly() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'hopium-hourly-dispatch';
select cron.schedule('hopium-hourly-dispatch', '1 * * * *', 'select public.hopium_dispatch_hourly()');

-- VERIFY: last 10 cron runs with the GitHub HTTP status (204 = dispatched; 401/403 = token; null = no response yet).
-- pg_net keeps responses ~6 h, so older rows show http_status null. Responses are matched to runs by time.
-- select d.start_time, d.status as cron_status, d.return_message, r.status_code as http_status,
--        left(coalesce(r.error_msg, r.content::text), 120) as detail
-- from cron.job_run_details d
-- left join lateral (select * from net._http_response r
--                    where r.created between d.start_time and d.start_time + interval '30 seconds'
--                    order by r.created limit 1) r on true
-- where d.jobid = (select jobid from cron.job where jobname = 'hopium-hourly-dispatch')
-- order by d.start_time desc limit 10;

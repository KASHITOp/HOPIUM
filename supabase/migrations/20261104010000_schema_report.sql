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

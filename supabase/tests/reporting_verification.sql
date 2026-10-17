-- Run after applying 202610170001_reporting.sql. Every assertion must return true.
select bool_and(c.relrowsecurity) as all_reporting_tables_use_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'reporting_stores', 'reporting_store_owners', 'reporting_events',
    'reporting_days', 'reporting_inventory'
  );

select
  has_table_privilege('authenticated', 'public.reporting_stores', 'select')
    and not has_table_privilege('authenticated', 'public.reporting_stores', 'insert')
    and not has_table_privilege('authenticated', 'public.reporting_days', 'update')
    and not has_table_privilege('authenticated', 'public.reporting_inventory', 'delete')
    as owner_role_is_read_only;

select
  has_function_privilege(
    'service_role', 'public.ingest_reporting_events(uuid,jsonb)', 'execute'
  )
    and not has_function_privilege(
      'authenticated', 'public.ingest_reporting_events(uuid,jsonb)', 'execute'
    )
    and not has_function_privilege(
      'anon', 'public.ingest_reporting_events(uuid,jsonb)', 'execute'
    )
    as ingestion_is_server_only;

select count(*) = 4 as owner_select_policy_count
from pg_policies
where schemaname = 'public'
  and policyname in (
    'owners read assigned stores', 'owners read own assignments',
    'owners read assigned days', 'owners read assigned inventory'
  )
  and cmd = 'SELECT';

select
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.reporting_events'::regclass
      and contype = 'p'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.reporting_events'::regclass
      and contype = 'u'
  ) as events_have_id_and_sequence_uniqueness;

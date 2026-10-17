create table if not exists public.reporting_stores (
  store_id uuid primary key,
  name text not null,
  stand_name text not null,
  location text not null default '',
  currency_code text not null default 'ZMW',
  currency_symbol text not null default 'K',
  timezone text not null default 'Africa/Lusaka',
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  last_synced_at timestamptz not null default now()
);

create table if not exists public.reporting_store_owners (
  store_id uuid not null references public.reporting_stores(store_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index if not exists reporting_store_owners_user_id_idx
  on public.reporting_store_owners(user_id, store_id);

create table if not exists public.reporting_events (
  event_id uuid primary key,
  store_id uuid not null references public.reporting_stores(store_id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  created_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (store_id, sequence)
);
create index if not exists reporting_events_store_received_idx
  on public.reporting_events(store_id, received_at desc);

create table if not exists public.reporting_days (
  store_id uuid not null references public.reporting_stores(store_id) on delete cascade,
  business_day_id text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  summary jsonb not null,
  last_sequence bigint not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, business_day_id)
);
create index if not exists reporting_days_store_opened_idx
  on public.reporting_days(store_id, opened_at desc);

create table if not exists public.reporting_inventory (
  store_id uuid primary key references public.reporting_stores(store_id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  last_sequence bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.reporting_stores enable row level security;
alter table public.reporting_store_owners enable row level security;
alter table public.reporting_events enable row level security;
alter table public.reporting_days enable row level security;
alter table public.reporting_inventory enable row level security;

create policy "owners read assigned stores"
  on public.reporting_stores for select to authenticated
  using (exists (
    select 1 from public.reporting_store_owners ownership
    where ownership.store_id = reporting_stores.store_id
      and ownership.user_id = (select auth.uid())
  ));
create policy "owners read own assignments"
  on public.reporting_store_owners for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owners read assigned days"
  on public.reporting_days for select to authenticated
  using (exists (
    select 1 from public.reporting_store_owners ownership
    where ownership.store_id = reporting_days.store_id
      and ownership.user_id = (select auth.uid())
  ));
create policy "owners read assigned inventory"
  on public.reporting_inventory for select to authenticated
  using (exists (
    select 1 from public.reporting_store_owners ownership
    where ownership.store_id = reporting_inventory.store_id
      and ownership.user_id = (select auth.uid())
  ));

revoke all on public.reporting_stores, public.reporting_store_owners,
  public.reporting_events, public.reporting_days, public.reporting_inventory
  from anon, authenticated;
grant select on public.reporting_stores, public.reporting_store_owners,
  public.reporting_days, public.reporting_inventory to authenticated;

create or replace function public.ingest_reporting_events(
  p_store_id uuid,
  p_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last bigint;
  v_max bigint;
  v_latest jsonb;
  v_accepted jsonb;
  v_duplicates jsonb;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'events must be a non-empty array';
  end if;

  insert into public.reporting_stores (
    store_id, name, stand_name, location, currency_code, currency_symbol, timezone
  )
  select p_store_id,
    coalesce(event->'payload'->'store'->>'business_name', 'Happy Cone'),
    coalesce(event->'payload'->'store'->>'stand_name', 'Store'),
    coalesce(event->'payload'->'store'->>'location', ''),
    coalesce(event->'payload'->'store'->>'currency_code', 'ZMW'),
    coalesce(event->'payload'->'store'->>'currency_symbol', 'K'),
    coalesce(event->'payload'->'store'->>'timezone', 'Africa/Lusaka')
  from jsonb_array_elements(p_events) event
  order by (event->>'sequence')::bigint desc
  limit 1
  on conflict (store_id) do nothing;

  select last_sequence into v_last
  from public.reporting_stores where store_id = p_store_id for update;

  if exists (
    select 1 from jsonb_array_elements(p_events) event
    where (event->>'sequence')::bigint <= v_last
      and not exists (
        select 1 from public.reporting_events existing
        where existing.store_id = p_store_id
          and existing.event_id = (event->>'event_id')::uuid
          and existing.sequence = (event->>'sequence')::bigint
      )
  ) then
    raise exception 'sequence conflicts with an existing event';
  end if;

  select max((event->>'sequence')::bigint) into v_max
  from jsonb_array_elements(p_events) event;
  if v_max > v_last and (
    select count(distinct (event->>'sequence')::bigint)
    from jsonb_array_elements(p_events) event
    where (event->>'sequence')::bigint > v_last
  ) <> v_max - v_last then
    raise exception 'event sequence contains a gap';
  end if;

  with input as (
    select event from jsonb_array_elements(p_events) event
  ), inserted as (
    insert into public.reporting_events (
      event_id, store_id, sequence, event_type, aggregate_type,
      aggregate_id, created_at, payload
    )
    select (event->>'event_id')::uuid, p_store_id,
      (event->>'sequence')::bigint, event->>'event_type',
      event->>'aggregate_type', event->>'aggregate_id',
      (event->>'created_at')::timestamptz, event->'payload'
    from input
    on conflict (event_id) do nothing
    returning event_id
  )
  select coalesce(jsonb_agg(event_id), '[]'::jsonb)
  into v_accepted from inserted;

  select coalesce(jsonb_agg((event->>'event_id')::uuid), '[]'::jsonb)
  into v_duplicates
  from jsonb_array_elements(p_events) event
  where not (event->>'event_id')::uuid in (
    select value::text::uuid from jsonb_array_elements_text(v_accepted)
  );

  for v_latest in
    select distinct on (event->'payload'->'day'->>'business_day_id') event
    from jsonb_array_elements(p_events) event
    where event->'payload'->'day'->>'business_day_id' is not null
    order by event->'payload'->'day'->>'business_day_id',
      (event->>'sequence')::bigint desc
  loop
    insert into public.reporting_days (
      store_id, business_day_id, opened_at, closed_at, summary, last_sequence
    ) values (
      p_store_id,
      v_latest->'payload'->'day'->>'business_day_id',
      (v_latest->'payload'->'day'->>'opened_at')::timestamptz,
      nullif(v_latest->'payload'->'day'->>'closed_at', '')::timestamptz,
      v_latest->'payload'->'day',
      (v_latest->>'sequence')::bigint
    )
    on conflict (store_id, business_day_id) do update set
      closed_at = excluded.closed_at,
      summary = excluded.summary,
      last_sequence = excluded.last_sequence,
      updated_at = now()
    where public.reporting_days.last_sequence < excluded.last_sequence;
  end loop;

  select event into v_latest from jsonb_array_elements(p_events) event
  order by (event->>'sequence')::bigint desc limit 1;
  insert into public.reporting_inventory (store_id, items, last_sequence)
  values (
    p_store_id,
    coalesce(v_latest->'payload'->'inventory', '[]'::jsonb),
    (v_latest->>'sequence')::bigint
  )
  on conflict (store_id) do update set
    items = excluded.items,
    last_sequence = excluded.last_sequence,
    updated_at = now()
  where public.reporting_inventory.last_sequence < excluded.last_sequence;

  update public.reporting_stores set
    name = coalesce(v_latest->'payload'->'store'->>'business_name', name),
    stand_name = coalesce(v_latest->'payload'->'store'->>'stand_name', stand_name),
    location = coalesce(v_latest->'payload'->'store'->>'location', location),
    currency_code = coalesce(v_latest->'payload'->'store'->>'currency_code', currency_code),
    currency_symbol = coalesce(v_latest->'payload'->'store'->>'currency_symbol', currency_symbol),
    timezone = coalesce(v_latest->'payload'->'store'->>'timezone', timezone),
    last_sequence = greatest(last_sequence, v_max),
    last_synced_at = now()
  where store_id = p_store_id;

  return jsonb_build_object('accepted', v_accepted, 'duplicates', v_duplicates);
end;
$$;

revoke all on function public.ingest_reporting_events(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_reporting_events(uuid, jsonb) to service_role;

-- Unapplied migration: static tests check the SQL contract, but actual PostgreSQL
-- concurrency, privilege, and rollback semantics require an integration run.
create table public.meta_ad_operations (
  operation_key text primary key check (operation_key ~ '^meta-paused-v1:[0-9a-f]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'OPEN' check (status in ('OPEN', 'RECONCILIATION_REQUIRED', 'COMPLETED')),
  checkpoints jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoints) = 'object'),
  attempting_step text check (attempting_step in ('image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad')),
  reconciliation_step text check (reconciliation_step in ('image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad')),
  reconciliation_history jsonb not null default '[]'::jsonb check (jsonb_typeof(reconciliation_history) = 'array'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, campaign_id),
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((status = 'RECONCILIATION_REQUIRED') = (reconciliation_step is not null)),
  check (status <> 'COMPLETED' or result is not null)
);

create table public.meta_ad_owner_daily_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null check (request_count >= 0),
  primary key (owner_id, usage_date)
);

create table public.meta_ad_global_daily_usage (
  usage_date date primary key,
  request_count integer not null check (request_count >= 0)
);

alter table public.meta_ad_operations enable row level security;
alter table public.meta_ad_owner_daily_usage enable row level security;
alter table public.meta_ad_global_daily_usage enable row level security;

revoke all on table public.meta_ad_operations from public, anon, authenticated, service_role;
revoke all on table public.meta_ad_owner_daily_usage from public, anon, authenticated, service_role;
revoke all on table public.meta_ad_global_daily_usage from public, anon, authenticated, service_role;

create or replace function public.acquire_meta_ad_operation(
  p_operation_key text,
  p_fingerprint text,
  p_owner_id uuid,
  p_campaign_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_daily_owner_limit integer,
  p_daily_global_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_usage_date date := (v_now at time zone 'UTC')::date;
  v_owner_count integer;
  v_global_count integer;
  v_operation public.meta_ad_operations%rowtype;
begin
  if p_operation_key is null
    or p_operation_key !~ '^meta-paused-v1:[0-9a-f]{64}$'
    or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_owner_id is null
    or p_campaign_id is null
    or p_lease_token is null
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 300
    or p_daily_owner_limit is null
    or p_daily_owner_limit not between 1 and 20
    or p_daily_global_limit is null
    or p_daily_global_limit not between 1 and 1000
    or p_daily_owner_limit > p_daily_global_limit then
    raise exception using errcode = 'P0001', message = 'meta_operation_invalid';
  end if;

  if not exists (
    select 1 from public.campaigns
    where id = p_campaign_id and owner_id = p_owner_id
  ) then
    raise exception using errcode = 'P0001', message = 'meta_operation_owner_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_campaign_id::text, 0)
  );

  select * into v_operation
  from public.meta_ad_operations
  where owner_id = p_owner_id and campaign_id = p_campaign_id
  for update;

  if found then
    if v_operation.operation_key <> p_operation_key or v_operation.fingerprint <> p_fingerprint then
      raise exception using errcode = 'P0001', message = 'meta_operation_conflict';
    end if;
  else
    insert into public.meta_ad_global_daily_usage (usage_date, request_count)
    values (v_usage_date, 0)
    on conflict (usage_date) do nothing;
    select request_count into v_global_count
    from public.meta_ad_global_daily_usage
    where usage_date = v_usage_date
    for update;
    if v_global_count >= p_daily_global_limit then
      raise exception using errcode = 'P0001', message = 'meta_operation_quota_exceeded';
    end if;

    insert into public.meta_ad_owner_daily_usage (owner_id, usage_date, request_count)
    values (p_owner_id, v_usage_date, 0)
    on conflict (owner_id, usage_date) do nothing;
    select request_count into v_owner_count
    from public.meta_ad_owner_daily_usage
    where owner_id = p_owner_id and usage_date = v_usage_date
    for update;
    if v_owner_count >= p_daily_owner_limit then
      raise exception using errcode = 'P0001', message = 'meta_operation_quota_exceeded';
    end if;

    update public.meta_ad_global_daily_usage
    set request_count = request_count + 1
    where usage_date = v_usage_date;
    update public.meta_ad_owner_daily_usage
    set request_count = request_count + 1
    where owner_id = p_owner_id and usage_date = v_usage_date;

    insert into public.meta_ad_operations (
      operation_key, fingerprint, owner_id, campaign_id
    ) values (
      p_operation_key, p_fingerprint, p_owner_id, p_campaign_id
    ) returning * into v_operation;
  end if;

  if v_operation.lease_token is not null
    and v_operation.lease_expires_at > v_now
    and v_operation.lease_token <> p_lease_token then
    raise exception using errcode = 'P0001', message = 'meta_operation_busy';
  end if;

  update public.meta_ad_operations
  set lease_token = p_lease_token,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where operation_key = p_operation_key
  returning * into v_operation;

  return pg_catalog.to_jsonb(v_operation) - 'lease_token' - 'lease_expires_at';
end;
$$;

create or replace function public.transition_meta_ad_operation(
  p_operation_key text,
  p_fingerprint text,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_action text,
  p_step text default null,
  p_external_id text default null,
  p_result jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_operation public.meta_ad_operations%rowtype;
begin
  if p_operation_key is null
    or p_operation_key !~ '^meta-paused-v1:[0-9a-f]{64}$'
    or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_action is null
    or p_action not in ('begin', 'checkpoint', 'reconcile', 'complete', 'release')
    or p_lease_token is null
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = 'P0001', message = 'meta_operation_invalid';
  end if;

  select * into v_operation
  from public.meta_ad_operations
  where operation_key = p_operation_key and fingerprint = p_fingerprint
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'meta_operation_conflict';
  end if;
  if v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_expires_at is null
    or v_operation.lease_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'meta_operation_lease_lost';
  end if;

  if p_action = 'begin' then
    if v_operation.status <> 'OPEN'
      or p_step is null
      or p_step not in ('image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad')
      or v_operation.checkpoints ? p_step
      or (v_operation.attempting_step is not null and v_operation.attempting_step <> p_step) then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    update public.meta_ad_operations set attempting_step = p_step where operation_key = p_operation_key;
  elsif p_action = 'checkpoint' then
    if v_operation.status <> 'OPEN'
      or p_step is null
      or p_step not in ('image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad')
      or v_operation.attempting_step <> p_step
      or p_external_id is null
      or p_external_id !~ '^[A-Za-z0-9_-]{5,256}$'
      or (v_operation.checkpoints ? p_step and v_operation.checkpoints ->> p_step <> p_external_id) then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    update public.meta_ad_operations
    set checkpoints = pg_catalog.jsonb_set(checkpoints, array[p_step], pg_catalog.to_jsonb(p_external_id), true),
        attempting_step = null
    where operation_key = p_operation_key;
  elsif p_action = 'reconcile' then
    if v_operation.status = 'COMPLETED'
      or p_step is null
      or p_step not in ('image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad')
      or v_operation.attempting_step is distinct from p_step then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    update public.meta_ad_operations
    set status = 'RECONCILIATION_REQUIRED',
        attempting_step = null,
        reconciliation_step = p_step
    where operation_key = p_operation_key;
  elsif p_action = 'complete' then
    if v_operation.status <> 'OPEN'
      or v_operation.attempting_step is not null
      or p_result is null
      or pg_catalog.jsonb_typeof(p_result) is distinct from 'object'
      or not (v_operation.checkpoints ?& array['image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad']) then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    if pg_catalog.jsonb_typeof(p_result -> 'operationKey') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'status') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'campaignId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'adSetId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'creativeId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'adId') is distinct from 'string'
      or p_result ->> 'operationKey' is distinct from p_operation_key
      or p_result ->> 'status' is distinct from 'PAUSED'
      or p_result ->> 'campaignId' is distinct from v_operation.checkpoints ->> 'campaign'
      or p_result ->> 'adSetId' is distinct from v_operation.checkpoints ->> 'ad-set'
      or p_result ->> 'creativeId' is distinct from v_operation.checkpoints ->> 'creative'
      or p_result ->> 'adId' is distinct from v_operation.checkpoints ->> 'ad' then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    if pg_catalog.jsonb_typeof(p_result -> 'imageHashes') is distinct from 'array' then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    if pg_catalog.jsonb_array_length(p_result -> 'imageHashes') <> 5
      or pg_catalog.jsonb_typeof(p_result -> 'imageHashes' -> 0) is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'imageHashes' -> 1) is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'imageHashes' -> 2) is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'imageHashes' -> 3) is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_result -> 'imageHashes' -> 4) is distinct from 'string'
      or p_result -> 'imageHashes' ->> 0 is distinct from v_operation.checkpoints ->> 'image:0'
      or p_result -> 'imageHashes' ->> 1 is distinct from v_operation.checkpoints ->> 'image:1'
      or p_result -> 'imageHashes' ->> 2 is distinct from v_operation.checkpoints ->> 'image:2'
      or p_result -> 'imageHashes' ->> 3 is distinct from v_operation.checkpoints ->> 'image:3'
      or p_result -> 'imageHashes' ->> 4 is distinct from v_operation.checkpoints ->> 'image:4' then
      raise exception using errcode = 'P0001', message = 'meta_operation_invalid_transition';
    end if;
    update public.meta_ad_operations
    set status = 'COMPLETED', result = p_result
    where operation_key = p_operation_key;
  else
    update public.meta_ad_operations
    set lease_token = null, lease_expires_at = null, updated_at = v_now
    where operation_key = p_operation_key;
    select * into v_operation from public.meta_ad_operations where operation_key = p_operation_key;
    return pg_catalog.to_jsonb(v_operation) - 'lease_token' - 'lease_expires_at';
  end if;

  update public.meta_ad_operations
  set lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where operation_key = p_operation_key
  returning * into v_operation;
  return pg_catalog.to_jsonb(v_operation) - 'lease_token' - 'lease_expires_at';
end;
$$;

create or replace function public.resolve_meta_ad_operation_reconciliation(
  p_operation_key text,
  p_fingerprint text,
  p_owner_id uuid,
  p_campaign_id uuid,
  p_step text,
  p_outcome text,
  p_external_id text,
  p_resolved_by text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_operation public.meta_ad_operations%rowtype;
  v_audit jsonb;
begin
  if p_operation_key is null
    or p_operation_key !~ '^meta-paused-v1:[0-9a-f]{64}$'
    or p_fingerprint is null
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_owner_id is null
    or p_campaign_id is null
    or p_step is null
    or p_step not in ('image:0', 'image:1', 'image:2', 'image:3', 'image:4', 'campaign', 'ad-set', 'creative', 'ad')
    or p_outcome is null
    or p_outcome not in ('VERIFIED_CREATED', 'VERIFIED_NOT_CREATED')
    or p_resolved_by is null
    or p_resolved_by !~ '^[A-Za-z0-9_-]{5,256}$'
    or p_note is null
    or pg_catalog.char_length(pg_catalog.btrim(p_note)) not between 8 and 500 then
    raise exception using errcode = 'P0001', message = 'meta_reconciliation_invalid';
  end if;

  select * into v_operation
  from public.meta_ad_operations
  where operation_key = p_operation_key
    and fingerprint = p_fingerprint
    and owner_id = p_owner_id
    and campaign_id = p_campaign_id
  for update;
  if not found
    or v_operation.status <> 'RECONCILIATION_REQUIRED'
    or v_operation.reconciliation_step <> p_step
    or (v_operation.lease_token is not null and v_operation.lease_expires_at > v_now) then
    raise exception using errcode = 'P0001', message = 'meta_reconciliation_conflict';
  end if;

  if p_outcome = 'VERIFIED_CREATED' then
    if p_external_id is null
      or p_external_id !~ '^[A-Za-z0-9_-]{5,256}$'
      or (v_operation.checkpoints ? p_step and v_operation.checkpoints ->> p_step <> p_external_id) then
      raise exception using errcode = 'P0001', message = 'meta_reconciliation_invalid';
    end if;
    v_operation.checkpoints := pg_catalog.jsonb_set(
      v_operation.checkpoints, array[p_step], pg_catalog.to_jsonb(p_external_id), true
    );
  elsif p_external_id is not null or v_operation.checkpoints ? p_step then
    raise exception using errcode = 'P0001', message = 'meta_reconciliation_invalid';
  end if;

  v_audit := pg_catalog.jsonb_build_object(
    'step', p_step,
    'outcome', p_outcome,
    'externalId', p_external_id,
    'resolvedBy', p_resolved_by,
    'note', pg_catalog.btrim(p_note),
    'resolvedAt', v_now
  );
  update public.meta_ad_operations
  set status = 'OPEN',
      checkpoints = v_operation.checkpoints,
      attempting_step = null,
      reconciliation_step = null,
      reconciliation_history = reconciliation_history || pg_catalog.jsonb_build_array(v_audit),
      updated_at = v_now
  where operation_key = p_operation_key
  returning * into v_operation;
  return pg_catalog.to_jsonb(v_operation) - 'lease_token' - 'lease_expires_at';
end;
$$;

revoke execute on function public.acquire_meta_ad_operation(text, text, uuid, uuid, uuid, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.transition_meta_ad_operation(text, text, uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.resolve_meta_ad_operation_reconciliation(text, text, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.acquire_meta_ad_operation(text, text, uuid, uuid, uuid, integer, integer, integer)
  to service_role;
grant execute on function public.transition_meta_ad_operation(text, text, uuid, integer, text, text, text, jsonb)
  to service_role;
grant execute on function public.resolve_meta_ad_operation_reconciliation(text, text, uuid, uuid, text, text, text, text, text)
  to service_role;

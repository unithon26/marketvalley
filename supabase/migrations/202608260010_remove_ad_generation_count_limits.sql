-- Remove application AI and Meta operation count caps while preserving the
-- existing RPC signatures for rolling deploys and rollback compatibility.
create or replace function public.consume_generation_quota(
  p_user_id uuid,
  p_max_requests integer,
  p_window_seconds integer,
  p_daily_user_limit integer,
  p_daily_global_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using errcode = 'P0001', message = 'generation_owner_required';
  end if;
  return true;
end;
$$;

comment on function public.consume_generation_quota(
  uuid, integer, integer, integer, integer
) is 'Compatibility RPC that no longer limits or counts AI generation requests.';

revoke execute on function public.consume_generation_quota(
  uuid, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.consume_generation_quota(
  uuid, integer, integer, integer, integer
) to service_role;

create or replace function public.acquire_meta_ad_operation(
  p_operation_key text,
  p_fingerprint text,
  p_owner_id uuid,
  p_campaign_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_daily_owner_limit integer default null,
  p_daily_global_limit integer default null
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
    or p_owner_id is null
    or p_campaign_id is null
    or p_lease_token is null
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 300 then
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

comment on function public.acquire_meta_ad_operation(
  text, text, uuid, uuid, uuid, integer, integer, integer
) is 'Acquires an idempotent Meta operation lease. Deprecated daily limit arguments are ignored for rolling compatibility.';

revoke execute on function public.acquire_meta_ad_operation(
  text, text, uuid, uuid, uuid, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.acquire_meta_ad_operation(
  text, text, uuid, uuid, uuid, integer, integer, integer
) to service_role;

create or replace function public.ad_generation_count_limits_disabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true;
$$;

comment on function public.ad_generation_count_limits_disabled()
is 'Deployment marker confirming application AI and Meta ad generation count limits are disabled.';

revoke execute on function public.ad_generation_count_limits_disabled()
from public, anon, authenticated;
grant execute on function public.ad_generation_count_limits_disabled()
to service_role;

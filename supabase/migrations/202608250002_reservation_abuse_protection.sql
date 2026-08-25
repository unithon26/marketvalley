create table public.reservation_campaign_minute_usage (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

create table public.reservation_global_minute_usage (
  singleton boolean primary key default true check (singleton),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

alter table public.reservation_campaign_minute_usage enable row level security;
alter table public.reservation_global_minute_usage enable row level security;

revoke all on table public.reservation_campaign_minute_usage from public, anon, authenticated;
revoke all on table public.reservation_global_minute_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.reservation_campaign_minute_usage to service_role;
grant select, insert, update, delete on table public.reservation_global_minute_usage to service_role;

create or replace function public.record_campaign_reservation(
  p_campaign_id uuid,
  p_name text,
  p_email text,
  p_email_hash text,
  p_consent_version text,
  p_consented_at timestamptz,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_reserved_at timestamptz,
  p_campaign_minute_limit integer,
  p_global_minute_limit integer,
  p_campaign_total_limit integer
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_global_started_at timestamptz;
  v_global_count integer;
  v_campaign_started_at timestamptz;
  v_campaign_count integer;
  v_total_count bigint;
  v_inserted integer;
begin
  if p_campaign_id is null
    or p_campaign_minute_limit is null
    or p_global_minute_limit is null
    or p_campaign_total_limit is null
    or p_campaign_minute_limit not between 1 and 1000
    or p_global_minute_limit not between 1 and 100000
    or p_campaign_total_limit not between 1 and 1000000
    or p_campaign_minute_limit > p_global_minute_limit then
    raise exception 'invalid reservation quota configuration';
  end if;

  if not exists (
    select 1 from public.campaigns where campaigns.id = p_campaign_id
  ) then
    return 'not_found';
  end if;

  insert into public.reservation_global_minute_usage (singleton, window_started_at, request_count)
  values (true, v_now, 0)
  on conflict (singleton) do nothing;

  select window_started_at, request_count
  into v_global_started_at, v_global_count
  from public.reservation_global_minute_usage
  where singleton = true
  for update;

  if v_global_started_at <= v_now - interval '1 minute' then
    update public.reservation_global_minute_usage
    set window_started_at = v_now, request_count = 0
    where singleton = true;
    v_global_count := 0;
  end if;

  if v_global_count >= p_global_minute_limit then
    return 'rate_limited';
  end if;

  perform 1 from public.campaigns where campaigns.id = p_campaign_id for update;
  if not found then
    return 'not_found';
  end if;

  insert into public.reservation_campaign_minute_usage (
    campaign_id, window_started_at, request_count
  )
  values (p_campaign_id, v_now, 0)
  on conflict (campaign_id) do nothing;

  select window_started_at, request_count
  into v_campaign_started_at, v_campaign_count
  from public.reservation_campaign_minute_usage
  where campaign_id = p_campaign_id
  for update;

  if v_campaign_started_at <= v_now - interval '1 minute' then
    update public.reservation_campaign_minute_usage
    set window_started_at = v_now, request_count = 0
    where campaign_id = p_campaign_id;
    v_campaign_count := 0;
  end if;

  if v_campaign_count >= p_campaign_minute_limit then
    return 'rate_limited';
  end if;

  update public.reservation_global_minute_usage
  set request_count = request_count + 1
  where singleton = true;

  update public.reservation_campaign_minute_usage
  set request_count = request_count + 1
  where campaign_id = p_campaign_id;

  if exists (
    select 1
    from public.campaign_reservations
    where campaign_id = p_campaign_id and email_hash = p_email_hash
  ) then
    return 'duplicate';
  end if;

  select count(*) into v_total_count
  from public.campaign_reservations
  where campaign_id = p_campaign_id;

  if v_total_count >= p_campaign_total_limit then
    return 'capacity';
  end if;

  insert into public.campaign_reservations (
    campaign_id,
    name,
    email,
    email_hash,
    consent_version,
    consented_at,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    reserved_at
  ) values (
    p_campaign_id,
    p_name,
    p_email,
    p_email_hash,
    p_consent_version,
    p_consented_at,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_utm_content,
    p_reserved_at
  )
  on conflict (campaign_id, email_hash) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;
  return 'inserted';
end;
$$;

revoke execute on function public.record_campaign_reservation(
  uuid, text, text, text, text, timestamptz, text, text, text, text,
  timestamptz, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.record_campaign_reservation(
  uuid, text, text, text, text, timestamptz, text, text, text, text,
  timestamptz, integer, integer, integer
) to service_role;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  draft_id text not null check (char_length(draft_id) between 1 and 100),
  slug text not null unique check (char_length(slug) between 1 and 120),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  next_action text check (next_action in ('continue', 'revise', 'pause')),
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, draft_id)
);

create table public.campaign_reservations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 200),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consented_at timestamptz not null,
  utm_source text check (utm_source is null or char_length(utm_source) between 1 and 100),
  utm_medium text check (utm_medium is null or char_length(utm_medium) between 1 and 100),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) between 1 and 100),
  utm_content text check (utm_content is null or char_length(utm_content) between 1 and 100),
  reserved_at timestamptz not null default now(),
  unique (campaign_id, email_hash)
);

create index campaign_reservations_campaign_reserved_at_idx
  on public.campaign_reservations (campaign_id, reserved_at desc);

create table public.generation_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

create table public.generation_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null check (request_count >= 0),
  primary key (user_id, usage_date)
);

create table public.generation_global_daily_usage (
  usage_date date primary key,
  request_count integer not null check (request_count >= 0)
);

alter table public.campaigns enable row level security;
alter table public.campaign_reservations enable row level security;
alter table public.generation_rate_limits enable row level security;
alter table public.generation_daily_usage enable row level security;
alter table public.generation_global_daily_usage enable row level security;

revoke all on table public.campaigns from anon, authenticated;
revoke all on table public.campaign_reservations from anon, authenticated;
revoke all on table public.generation_rate_limits from anon, authenticated;
revoke all on table public.generation_daily_usage from anon, authenticated;
revoke all on table public.generation_global_daily_usage from anon, authenticated;

grant select, insert, update, delete on table public.campaigns to authenticated;
grant select, delete on table public.campaign_reservations to authenticated;
grant select, insert, update, delete on table public.campaigns to service_role;
grant select, insert, update, delete on table public.campaign_reservations to service_role;
grant select, insert, update, delete on table public.generation_rate_limits to service_role;
grant select, insert, update, delete on table public.generation_daily_usage to service_role;
grant select, insert, update, delete on table public.generation_global_daily_usage to service_role;

create policy campaigns_owner_select
  on public.campaigns
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy campaigns_owner_insert
  on public.campaigns
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy campaigns_owner_update
  on public.campaigns
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy campaigns_owner_delete
  on public.campaigns
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy campaign_reservations_owner_select
  on public.campaign_reservations
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.campaigns
      where campaigns.id = campaign_reservations.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  );

create policy campaign_reservations_owner_delete
  on public.campaign_reservations
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.campaigns
      where campaigns.id = campaign_reservations.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  );

create or replace function public.reset_owned_campaign(
  p_campaign_id uuid,
  p_draft_id text
)
returns setof public.campaigns
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.campaign_reservations
  where campaign_id = p_campaign_id
    and exists (
      select 1
      from public.campaigns
      where campaigns.id = p_campaign_id
        and campaigns.owner_id = auth.uid()
        and campaigns.draft_id = p_draft_id
    );

  return query
  update public.campaigns
  set next_action = null
  where id = p_campaign_id
    and owner_id = auth.uid()
    and draft_id = p_draft_id
  returning campaigns.*;
end;
$$;

revoke execute on function public.reset_owned_campaign(uuid, text) from public, anon;
grant execute on function public.reset_owned_campaign(uuid, text) to authenticated;

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
declare
  v_now timestamptz := clock_timestamp();
  v_usage_date date := (v_now at time zone 'UTC')::date;
  v_window_started_at timestamptz;
  v_window_count integer;
  v_user_daily_count integer;
  v_global_daily_count integer;
begin
  if p_user_id is null
    or p_max_requests not between 1 and 20
    or p_window_seconds not between 10 and 3600
    or p_daily_user_limit not between 1 and 1000
    or p_daily_global_limit not between 1 and 100000
    or p_daily_user_limit > p_daily_global_limit then
    raise exception 'invalid generation quota configuration';
  end if;

  insert into public.generation_global_daily_usage (usage_date, request_count)
  values (v_usage_date, 0)
  on conflict (usage_date) do nothing;

  select request_count
  into v_global_daily_count
  from public.generation_global_daily_usage
  where usage_date = v_usage_date
  for update;

  if v_global_daily_count >= p_daily_global_limit then
    return false;
  end if;

  insert into public.generation_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, v_usage_date, 0)
  on conflict (user_id, usage_date) do nothing;

  select request_count
  into v_user_daily_count
  from public.generation_daily_usage
  where user_id = p_user_id and usage_date = v_usage_date
  for update;

  if v_user_daily_count >= p_daily_user_limit then
    return false;
  end if;

  insert into public.generation_rate_limits (user_id, window_started_at, request_count)
  values (p_user_id, v_now, 0)
  on conflict (user_id) do nothing;

  select window_started_at, request_count
  into v_window_started_at, v_window_count
  from public.generation_rate_limits
  where user_id = p_user_id
  for update;

  if v_window_started_at > v_now - make_interval(secs => p_window_seconds)
    and v_window_count >= p_max_requests then
    return false;
  end if;

  update public.generation_global_daily_usage
  set request_count = request_count + 1
  where usage_date = v_usage_date;

  update public.generation_daily_usage
  set request_count = request_count + 1
  where user_id = p_user_id and usage_date = v_usage_date;

  update public.generation_rate_limits
  set
    window_started_at = case
      when window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
      else window_started_at
    end,
    request_count = case
      when window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
      else request_count + 1
    end
  where user_id = p_user_id;

  return true;
end;
$$;

revoke execute on function public.consume_generation_quota(uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_generation_quota(uuid, integer, integer, integer, integer)
  to service_role;

create table public.campaign_daily_visitors (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  visit_date date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_visited_at timestamptz not null default now(),
  primary key (campaign_id, visit_date, visitor_hash)
);

create table public.meta_ad_runs (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique references public.meta_ad_operations(operation_key) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  ad_account_id text not null check (ad_account_id ~ '^[0-9]{5,32}$'),
  meta_campaign_id text not null check (meta_campaign_id ~ '^[0-9]{5,32}$'),
  meta_ad_set_id text not null check (meta_ad_set_id ~ '^[0-9]{5,32}$'),
  meta_creative_id text not null check (meta_creative_id ~ '^[0-9]{5,32}$'),
  meta_ad_id text not null check (meta_ad_id ~ '^[0-9]{5,32}$'),
  lifetime_budget_minor integer not null check (lifetime_budget_minor >= 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'PAUSED' check (
    status in ('PAUSED', 'ACTIVATING', 'ACTIVE', 'PAUSING', 'FAILED')
  ),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paused_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((approved_by is null) = (approved_at is null))
);

create index meta_ad_runs_owner_campaign_created_idx
  on public.meta_ad_runs (owner_id, campaign_id, created_at desc);

create table public.meta_insight_snapshots (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.meta_ad_runs(id) on delete cascade,
  impressions bigint not null check (impressions >= 0),
  reach bigint not null check (reach >= 0),
  clicks bigint not null check (clicks >= 0),
  link_clicks bigint not null check (link_clicks >= 0),
  spend_minor bigint not null check (spend_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  date_start date not null,
  date_stop date not null,
  is_final boolean not null default false,
  fetched_at timestamptz not null default now(),
  check (date_stop >= date_start)
);

create index meta_insight_snapshots_run_fetched_idx
  on public.meta_insight_snapshots (run_id, fetched_at desc);

alter table public.campaign_daily_visitors enable row level security;
alter table public.meta_ad_runs enable row level security;
alter table public.meta_insight_snapshots enable row level security;

revoke all on table public.campaign_daily_visitors from public, anon, authenticated, service_role;
revoke all on table public.meta_ad_runs from public, anon, authenticated, service_role;
revoke all on table public.meta_insight_snapshots from public, anon, authenticated, service_role;

grant select on table public.campaign_daily_visitors to service_role;
grant select, insert, update on table public.meta_ad_runs to service_role;
grant select, insert on table public.meta_insight_snapshots to service_role;
grant usage, select on sequence public.meta_insight_snapshots_id_seq to service_role;

create or replace function public.record_campaign_visit(
  p_campaign_id uuid,
  p_visitor_hash text,
  p_visited_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  if p_campaign_id is null
    or p_visitor_hash is null
    or p_visitor_hash !~ '^[0-9a-f]{64}$'
    or p_visited_at is null
    or p_visited_at > clock_timestamp() + interval '5 minutes'
    or p_visited_at < clock_timestamp() - interval '2 days' then
    raise exception using errcode = 'P0001', message = 'campaign_visit_invalid';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception using errcode = 'P0001', message = 'campaign_visit_not_found';
  end if;

  insert into public.campaign_daily_visitors (
    campaign_id, visit_date, visitor_hash, first_visited_at
  ) values (
    p_campaign_id,
    (p_visited_at at time zone 'UTC')::date,
    p_visitor_hash,
    p_visited_at
  ) on conflict do nothing;
  get diagnostics v_row_count = row_count;
  return v_row_count = 1;
end;
$$;

revoke all on function public.record_campaign_visit(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_campaign_visit(uuid, text, timestamptz) to service_role;

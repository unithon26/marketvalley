alter table public.campaigns
  alter column slug drop not null,
  alter column spec drop not null,
  alter column published_at drop not null,
  add column input_background text check (
    input_background is null or char_length(input_background) between 20 and 600
  ),
  add column input_solution text check (
    input_solution is null or char_length(input_solution) between 20 and 500
  ),
  add column lifecycle_status text not null default 'SUBMITTED' check (
    lifecycle_status in (
      'SUBMITTED',
      'GENERATING',
      'PREPARING',
      'AWAITING_ACTIVATION',
      'COLLECTING',
      'FINALIZING',
      'COMPLETED',
      'RETRY_WAIT',
      'FAILED',
      'ARCHIVED'
    )
  ),
  add column generation_attempts integer not null default 0 check (
    generation_attempts between 0 and 10
  ),
  add column stage_attempts integer not null default 0 check (
    stage_attempts between 0 and 10
  ),
  add column retry_from_status text check (
    retry_from_status is null or retry_from_status in (
      'GENERATING', 'PREPARING', 'AWAITING_ACTIVATION', 'COLLECTING', 'FINALIZING'
    )
  ),
  add column next_attempt_at timestamptz default now(),
  add column processing_token uuid,
  add column processing_lease_until timestamptz,
  add column preparation_completed_at timestamptz,
  add column collection_started_at timestamptz,
  add column collection_ends_at timestamptz,
  add column completed_at timestamptz,
  add column last_error_code text check (
    last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,80}$'
  ),
  add column last_error_message text check (
    last_error_message is null or char_length(last_error_message) between 1 and 500
  ),
  add column updated_at timestamptz not null default now();

alter table public.campaigns
  add constraint campaigns_materialization_consistency check (
    (
      spec is null
      and slug is null
      and published_at is null
      and input_background is not null
      and input_solution is not null
      and lifecycle_status in ('SUBMITTED', 'GENERATING', 'RETRY_WAIT', 'FAILED')
    )
    or
    (
      spec is not null
      and slug is not null
      and published_at is not null
    )
  ),
  add constraint campaigns_collection_window_consistency check (
    collection_ends_at is null
    or collection_started_at is null
    or collection_ends_at > collection_started_at
  );

create index campaigns_owner_lifecycle_updated_idx
  on public.campaigns (owner_id, lifecycle_status, updated_at desc);

create index campaigns_lifecycle_due_idx
  on public.campaigns (next_attempt_at, created_at)
  where lifecycle_status in (
    'SUBMITTED',
    'GENERATING',
    'PREPARING',
    'AWAITING_ACTIVATION',
    'COLLECTING',
    'FINALIZING',
    'RETRY_WAIT'
  );

do $$
begin
  if exists (
    select 1
    from public.meta_ad_runs
    where status in ('ACTIVATING', 'ACTIVE', 'PAUSING')
    group by ad_account_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'multiple_live_meta_runs_per_account';
  end if;
end;
$$;

create unique index meta_ad_runs_one_live_per_account_idx
  on public.meta_ad_runs (ad_account_id)
  where status in ('ACTIVATING', 'ACTIVE', 'PAUSING');

-- Every campaign that predates this durable lifecycle is historical unless an
-- actual Meta run below proves that work is still active. This prevents old
-- presentation campaigns from being picked up and unexpectedly advertised.
update public.campaigns
set
  lifecycle_status = 'ARCHIVED',
  next_attempt_at = null,
  updated_at = now();

with latest_runs as (
  select distinct on (campaign_id)
    campaign_id,
    id,
    status,
    approved_at,
    starts_at,
    ends_at
  from public.meta_ad_runs
  order by campaign_id, created_at desc
), final_runs as (
  select distinct run_id
  from public.meta_insight_snapshots
  where is_final = true
)
update public.campaigns as campaigns
set
  lifecycle_status = case
    when final_runs.run_id is not null then 'COMPLETED'
    when latest_runs.status in ('ACTIVE', 'ACTIVATING') then 'COLLECTING'
    when latest_runs.status = 'PAUSING' then 'FINALIZING'
    when latest_runs.status = 'PAUSED' and latest_runs.approved_at is not null
      then case when latest_runs.ends_at <= now() then 'FINALIZING' else 'COLLECTING' end
    when latest_runs.id is not null then 'AWAITING_ACTIVATION'
    else 'ARCHIVED'
  end,
  preparation_completed_at = case
    when latest_runs.id is not null then coalesce(campaigns.published_at, campaigns.created_at)
    else null
  end,
  collection_started_at = case
    when latest_runs.approved_at is not null then latest_runs.starts_at
    else null
  end,
  collection_ends_at = latest_runs.ends_at,
  completed_at = case
    when final_runs.run_id is not null then now()
    else null
  end,
  next_attempt_at = case
    when latest_runs.status in ('ACTIVE', 'ACTIVATING') then now()
    when latest_runs.status = 'PAUSED' and latest_runs.approved_at is null then now()
    when latest_runs.status in ('PAUSED', 'PAUSING') and latest_runs.approved_at is not null
      then greatest(now(), latest_runs.ends_at)
    else null
  end,
  updated_at = now()
from latest_runs
left join final_runs on final_runs.run_id = latest_runs.id
where campaigns.id = latest_runs.campaign_id;

create or replace function public.claim_campaign_lifecycle(
  p_campaign_id uuid default null
)
returns setof public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'campaign_lifecycle_service_role_required';
  end if;

  return query
  with candidate as (
    select campaigns.id
    from public.campaigns
    where (p_campaign_id is null or campaigns.id = p_campaign_id)
      and campaigns.lifecycle_status in (
        'SUBMITTED',
        'GENERATING',
        'PREPARING',
        'AWAITING_ACTIVATION',
        'COLLECTING',
        'FINALIZING',
        'RETRY_WAIT'
      )
      and (campaigns.next_attempt_at is null or campaigns.next_attempt_at <= clock_timestamp())
      and (
        campaigns.processing_lease_until is null
        or campaigns.processing_lease_until <= clock_timestamp()
      )
    order by campaigns.created_at
    for update skip locked
    limit 1
  )
  update public.campaigns as campaigns
  set
    processing_token = gen_random_uuid(),
    processing_lease_until = clock_timestamp() + interval '10 minutes',
    updated_at = clock_timestamp()
  from candidate
  where campaigns.id = candidate.id
  returning campaigns.*;
end;
$$;

revoke execute on function public.claim_campaign_lifecycle(uuid) from public, anon, authenticated;
grant execute on function public.claim_campaign_lifecycle(uuid) to service_role;

create or replace function public.renew_campaign_lifecycle_lease(
  p_campaign_id uuid,
  p_processing_token uuid,
  p_status text
)
returns setof public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'campaign_lifecycle_service_role_required';
  end if;

  if p_status not in ('GENERATING', 'PREPARING', 'AWAITING_ACTIVATION', 'COLLECTING', 'FINALIZING') then
    raise exception using errcode = 'P0001', message = 'campaign_lifecycle_invalid_status';
  end if;

  return query
  update public.campaigns as campaigns
  set
    lifecycle_status = p_status,
    generation_attempts = case
      when p_status = 'GENERATING'
        then campaigns.generation_attempts + 1
      else campaigns.generation_attempts
    end,
    stage_attempts = campaigns.stage_attempts + 1,
    retry_from_status = null,
    processing_lease_until = clock_timestamp() + interval '10 minutes',
    updated_at = clock_timestamp()
  where campaigns.id = p_campaign_id
    and campaigns.processing_token = p_processing_token
    and campaigns.processing_lease_until > clock_timestamp()
  returning campaigns.*;

  if not found then
    raise exception using errcode = 'P0001', message = 'campaign_lifecycle_lease_lost';
  end if;
end;
$$;

revoke execute on function public.renew_campaign_lifecycle_lease(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.renew_campaign_lifecycle_lease(uuid, uuid, text) to service_role;

create or replace function public.transition_campaign_lifecycle(
  p_campaign_id uuid,
  p_processing_token uuid,
  p_status text,
  p_spec jsonb default null,
  p_slug text default null,
  p_published_at timestamptz default null,
  p_next_attempt_at timestamptz default null,
  p_preparation_completed_at timestamptz default null,
  p_collection_started_at timestamptz default null,
  p_collection_ends_at timestamptz default null,
  p_completed_at timestamptz default null,
  p_last_error_code text default null,
  p_last_error_message text default null,
  p_clear_error boolean default false
)
returns setof public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'campaign_lifecycle_service_role_required';
  end if;

  if p_status not in (
    'SUBMITTED', 'GENERATING', 'PREPARING', 'AWAITING_ACTIVATION',
    'COLLECTING', 'FINALIZING', 'COMPLETED', 'RETRY_WAIT', 'FAILED', 'ARCHIVED'
  ) then
    raise exception using errcode = 'P0001', message = 'campaign_lifecycle_invalid_status';
  end if;

  return query
  update public.campaigns as campaigns
  set
    lifecycle_status = p_status,
    spec = coalesce(p_spec, campaigns.spec),
    slug = coalesce(p_slug, campaigns.slug),
    published_at = coalesce(p_published_at, campaigns.published_at),
    next_attempt_at = p_next_attempt_at,
    preparation_completed_at = coalesce(
      p_preparation_completed_at,
      campaigns.preparation_completed_at
    ),
    collection_started_at = coalesce(p_collection_started_at, campaigns.collection_started_at),
    collection_ends_at = coalesce(p_collection_ends_at, campaigns.collection_ends_at),
    completed_at = coalesce(p_completed_at, campaigns.completed_at),
    stage_attempts = case
      when p_status in ('RETRY_WAIT', 'FAILED') then campaigns.stage_attempts
      else 0
    end,
    retry_from_status = case
      when p_status = 'RETRY_WAIT' then campaigns.lifecycle_status
      else null
    end,
    last_error_code = case
      when p_clear_error then null
      else coalesce(p_last_error_code, campaigns.last_error_code)
    end,
    last_error_message = case
      when p_clear_error then null
      else coalesce(p_last_error_message, campaigns.last_error_message)
    end,
    processing_token = null,
    processing_lease_until = null,
    updated_at = clock_timestamp()
  where campaigns.id = p_campaign_id
    and campaigns.processing_token = p_processing_token
    and campaigns.processing_lease_until > clock_timestamp()
  returning campaigns.*;

  if not found then
    raise exception using errcode = 'P0001', message = 'campaign_lifecycle_lease_lost';
  end if;
end;
$$;

revoke execute on function public.transition_campaign_lifecycle(
  uuid, uuid, text, jsonb, text, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.transition_campaign_lifecycle(
  uuid, uuid, text, jsonb, text, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, text, text, boolean
) to service_role;

-- Product users may create only an input submission and may update only their
-- final human decision. Lifecycle, materialized content, schedule, and deletion
-- are service-controlled so a browser cannot fake completion or orphan live ads.
revoke insert, update, delete on table public.campaigns from authenticated;
grant insert (draft_id, input_background, input_solution) on table public.campaigns to authenticated;
grant update (next_action) on table public.campaigns to authenticated;
drop policy if exists campaigns_owner_delete on public.campaigns;

create or replace function public.delete_owned_unstarted_campaign(
  p_campaign_id uuid,
  p_draft_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if exists (
    select 1
    from public.meta_ad_runs
    where campaign_id = p_campaign_id
  ) then
    raise exception using errcode = 'P0001', message = 'campaign_has_meta_run';
  end if;

  delete from public.campaigns
  where id = p_campaign_id
    and owner_id = auth.uid()
    and draft_id = p_draft_id
    and lifecycle_status in ('SUBMITTED', 'GENERATING', 'RETRY_WAIT', 'FAILED');
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke execute on function public.delete_owned_unstarted_campaign(uuid, text) from public, anon;
grant execute on function public.delete_owned_unstarted_campaign(uuid, text) to authenticated;

create or replace function public.delete_owned_inactive_campaign(
  p_campaign_id uuid,
  p_draft_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_campaign
  from public.campaigns
  where id = p_campaign_id
    and owner_id = auth.uid()
    and draft_id = p_draft_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_campaign.processing_lease_until is not null
    and v_campaign.processing_lease_until > clock_timestamp() then
    return 'processing';
  end if;
  if exists (
    select 1
    from public.meta_ad_runs
    where campaign_id = p_campaign_id
      and status <> 'PAUSED'
  ) then
    return 'live_ad';
  end if;
  if exists (
    select 1
    from public.meta_ad_operations
    where campaign_id = p_campaign_id
  ) and not exists (
    select 1
    from public.meta_ad_runs
    where campaign_id = p_campaign_id
  ) then
    return 'external_state_unknown';
  end if;

  delete from public.campaigns where id = p_campaign_id;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_owned_inactive_campaign(uuid, text)
  from public, anon;
grant execute on function public.delete_owned_inactive_campaign(uuid, text)
  to authenticated;

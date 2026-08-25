revoke execute on function public.reset_owned_campaign(uuid, text)
  from public, anon, authenticated;

drop function if exists public.reset_owned_campaign(uuid, text);

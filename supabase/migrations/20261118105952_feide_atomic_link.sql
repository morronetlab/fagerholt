-- Feide: atomic guardian-approved link, service-role only.
-- This is additive; no existing child or family rows are modified.
-- SECURITY INVOKER executes under the *service_role* which already holds
-- grants to the private-by-RLS Feide tables. The function is deliberately
-- not callable by browsers (anon or authenticated).
create or replace function public.feide_confirm_link(
  p_request_id uuid,
  p_child_id uuid,
  p_family_id uuid,
  p_parent_id uuid,
  p_confirmation_hash text
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.feide_link_requests%rowtype;
begin
  if p_request_id is null or p_child_id is null or
     p_family_id is null or p_parent_id is null or
     p_confirmation_hash is null or
     p_confirmation_hash !~ '^[a-f0-9]{64}$' then
    return 'invalid';
  end if;
  select * into r from public.feide_link_requests
    where id = p_request_id for update;
  if not found then return 'invalid'; end if;
  if r.child_id <> p_child_id or r.family_id <> p_family_id or
     r.created_by <> p_parent_id then
    return 'invalid';
  end if;
  if r.approved_at is not null then return 'already_approved'; end if;
  if r.expires_at <= now() then return 'expired'; end if;
  if r.failed_attempts >= 5 then return 'locked'; end if;
  if r.subject_hash is null or r.confirmation_hash is null then
    return 'not_claimed';
  end if;
  if r.confirmation_hash <> p_confirmation_hash then
    update public.feide_link_requests
       set failed_attempts = least(5,failed_attempts+1)
     where id = r.id;
    return 'incorrect';
  end if;
  insert into public.feide_child_links
     (family_id,child_id,subject_hash,linked_by)
  values (r.family_id,r.child_id,r.subject_hash,p_parent_id);
  update public.feide_link_requests
     set approved_at=now()
   where id=r.id;
  return 'linked';
exception when unique_violation then
  return 'conflict';
end;
$$;
revoke all on function public.feide_confirm_link(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.feide_confirm_link(uuid,uuid,uuid,uuid,text)
  to service_role;
comment on function public.feide_confirm_link(uuid,uuid,uuid,uuid,text) is
  'Service-only, atomic and rate-limited confirmation of a Feide-to-child link.';
notify pgrst,'reload schema';

-- Applied 2026-10-31: service-only grants for child access Netlify functions.
-- Supabase's default privileges did not grant service_role access to the new
-- RLS-enabled tables. Do not grant to anon or authenticated.
grant select, insert, update, delete
  on table public.child_pairings, public.child_device_sessions
  to service_role;

-- Match the child/family foreign keys and pairing creator lookup.
create index if not exists child_pairings_child_family_idx on public.child_pairings(child_id,family_id);
create index if not exists child_device_sessions_child_family_idx on public.child_device_sessions(child_id,family_id);
create index if not exists child_pairings_created_by_idx on public.child_pairings(created_by);
notify pgrst, 'reload schema';

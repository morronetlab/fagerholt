-- Production hotfix applied at 2026-10-31 17:00:17 UTC.
-- After QR redemption, read-only child sessions must fetch scoped family
-- activities. The service_role had no SELECT grant, so children got 503.
-- No grants to anon/authenticated are added.
grant select on public.family_activities to service_role;
notify pgrst, 'reload schema';

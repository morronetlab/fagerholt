-- Explicit opt-in for Sunday parent digest.
-- No email address, child names or access tokens stored in this table.
-- All writes require the authenticated Supabase user to own this row.
create table if not exists public.weekly_digest_subscriptions(
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 opted_in_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.weekly_digest_subscriptions enable row level security;
revoke all on public.weekly_digest_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.weekly_digest_subscriptions to authenticated;
drop policy if exists "parent reads own digest preference" on public.weekly_digest_subscriptions;
create policy "parent reads own digest preference"
 on public.weekly_digest_subscriptions for select to authenticated
 using ((select auth.uid())=user_id);
drop policy if exists "parent opts in to own digest" on public.weekly_digest_subscriptions;
create policy "parent opts in to own digest"
 on public.weekly_digest_subscriptions for insert to authenticated
 with check (
  (select auth.uid())=user_id
  and exists(select 1 from public.family_members f
   where f.user_id=(select auth.uid()) and f.role in ('owner','parent'))
  and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 );
drop policy if exists "parent updates own digest preference" on public.weekly_digest_subscriptions;
create policy "parent updates own digest preference"
 on public.weekly_digest_subscriptions for update to authenticated
 using ((select auth.uid())=user_id)
 with check (
  (select auth.uid())=user_id
  and exists(select 1 from public.family_members f
   where f.user_id=(select auth.uid()) and f.role in ('owner','parent'))
  and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 );
drop policy if exists "parent turns off own digest" on public.weekly_digest_subscriptions;
create policy "parent turns off own digest"
 on public.weekly_digest_subscriptions for delete to authenticated
 using ((select auth.uid())=user_id);
create index if not exists weekly_digest_subscriptions_enabled_idx
 on public.weekly_digest_subscriptions(user_id) where enabled;
comment on table public.weekly_digest_subscriptions is
 'Parent-initiated Sunday digest opt-in. Addresses are retrieved from verified Supabase Auth only at send time.';

-- Production worker uses a server-side service-role key held only in Netlify.
-- No anonymous/public access to recipient enumeration or email identities.

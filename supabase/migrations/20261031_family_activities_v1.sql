-- Family week activities v1. Run on a preview/staging database before production.
-- Activities are shared exclusively among authenticated parents in one family.
-- Dates are local calendar days, and time fields are local wall-clock times.
create table if not exists public.family_activities (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid null,
 title text not null check (char_length(btrim(title)) between 1 and 120),
 occurs_on date not null check (occurs_on between date '2020-01-01' and date '2100-12-31'),
 start_time time without time zone,
 end_time time without time zone,
 repeat_rule text not null default 'none' check (repeat_rule in ('none','weekly')),
 repeat_until date,
 location text not null default '' check (char_length(location) <= 120),
 responsible text not null default '' check (char_length(responsible) <= 80),
 notes text not null default '' check (char_length(notes) <= 600),
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint family_activities_child_same_family
  foreign key (child_id,family_id) references public.children(id,family_id) on delete cascade,
 constraint family_activities_time_range
  check ((start_time is not null or end_time is null) and
         (end_time is null or end_time > start_time)),
 constraint family_activities_repeat_range
  check ((repeat_rule = 'none' and repeat_until is null) or
         (repeat_rule = 'weekly' and (repeat_until is null or repeat_until >= occurs_on)))
);
create index if not exists family_activities_family_date_idx
 on public.family_activities(family_id,occurs_on);
create index if not exists family_activities_family_repeat_idx
 on public.family_activities(family_id,repeat_rule,repeat_until)
 where repeat_rule = 'weekly';

alter table public.family_activities enable row level security;
revoke all on table public.family_activities from public,anon,authenticated;
-- Client may only edit activity details; not reassign family, creator or id.
grant select,insert,delete on table public.family_activities to authenticated;
grant update (child_id,title,occurs_on,start_time,end_time,repeat_rule,repeat_until,
 location,responsible,notes) on table public.family_activities to authenticated;

drop policy if exists "parents read shared activities" on public.family_activities;
create policy "parents read shared activities" on public.family_activities
 for select to authenticated
 using (family_id in (select private.parent_family_ids()));
drop policy if exists "parents create shared activities" on public.family_activities;
create policy "parents create shared activities" on public.family_activities
 for insert to authenticated
 with check (
  family_id in (select private.parent_family_ids())
  and created_by = (select auth.uid())
  and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 );
drop policy if exists "parents edit shared activities" on public.family_activities;
create policy "parents edit shared activities" on public.family_activities
 for update to authenticated
 using (family_id in (select private.parent_family_ids()))
 with check (family_id in (select private.parent_family_ids()));
drop policy if exists "parents delete shared activities" on public.family_activities;
create policy "parents delete shared activities" on public.family_activities
 for delete to authenticated
 using (family_id in (select private.parent_family_ids()));

comment on table public.family_activities is
 'Family-owned weekly activities; visible to parents in the same family via RLS. No service key or public access.';

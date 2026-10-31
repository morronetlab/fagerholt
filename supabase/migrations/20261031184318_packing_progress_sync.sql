-- Applied to Supabase as migration 20261031184318 (31 Oct 2026).
-- Shared day-specific packing checks for children and guardians.
create table public.packing_progress (
 family_id uuid not null,
 child_id uuid not null,
 school_year integer not null check (school_year between 2020 and 2100),
 school_week integer not null check (school_week between 1 and 53),
 task_key text not null check (task_key ~ '^[a-f0-9]{16}$'),
 completed boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 updated_by_device uuid references public.child_device_sessions(id) on delete set null,
 primary key(child_id, school_year, school_week, task_key),
 foreign key(child_id,family_id) references public.children(id,family_id) on delete cascade
);
create index packing_progress_family_week_idx on public.packing_progress(family_id,school_year,school_week);

create function private.stamp_packing()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.updated_at=now();
 if (select auth.uid()) is not null then
   new.updated_by=(select auth.uid());
   new.updated_by_device=null;
 else
   if new.updated_by_device is null or not exists (
    select 1 from public.child_device_sessions d
    where d.id=new.updated_by_device and d.child_id=new.child_id
      and d.family_id=new.family_id and d.revoked_at is null
      and d.expires_at>now()
   ) then
     raise exception 'Invalid child device for packing';
   end if;
   new.updated_by=null;
 end if;
 return new;
end;
$$;
create trigger packing_progress_stamp before insert or update on public.packing_progress
for each row execute function private.stamp_packing();

alter table public.packing_progress enable row level security;
revoke all on public.packing_progress from public,anon,authenticated;
grant select,insert,update,delete on public.packing_progress to authenticated;
grant select,insert,update on public.packing_progress to service_role;

create policy "guardians read packing status" on public.packing_progress
for select to authenticated using (family_id in (select private.parent_family_ids()));
create policy "guardians add packing status" on public.packing_progress
for insert to authenticated with check (
 family_id in (select private.parent_family_ids()) and updated_by=(select auth.uid()));
create policy "guardians edit packing status" on public.packing_progress
for update to authenticated using (
 family_id in (select private.parent_family_ids()))
 with check (family_id in (select private.parent_family_ids())
 and updated_by=(select auth.uid()));
create policy "guardians remove packing status" on public.packing_progress
for delete to authenticated using (family_id in (select private.parent_family_ids()));

revoke all on function private.stamp_packing() from public;
notify pgrst,'reload schema';

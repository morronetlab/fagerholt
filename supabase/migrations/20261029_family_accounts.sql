-- Ukeplanen 2.1 / Phase 1. Execute in a dedicated Supabase project.
-- Only guardians with verified email can create/join families.
-- Children do not get accounts or database write access in this phase.
create schema if not exists private;

create table if not exists public.families (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(trim(name)) between 1 and 80),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.family_members (
 family_id uuid not null references public.families(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','parent')),
 joined_at timestamptz not null default now(),
 primary key(family_id,user_id)
);
create index if not exists family_members_user_idx on public.family_members(user_id,family_id);

create table if not exists public.children (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 nickname text not null check(char_length(trim(nickname)) between 1 and 40),
 school_id text not null check (char_length(school_id) between 1 and 80),
 grade text not null check (grade ~ '^[1-7][A-F]?$'),
 group_name text not null default '' check(char_length(group_name)<=35),
 created_at timestamptz not null default now(),
 unique(id,family_id)
);
create index if not exists children_family_idx on public.children(family_id);

-- Task keys are stable fingerprints, never indexes in a changing PDF list.
create table if not exists public.homework_progress (
 child_id uuid not null,
 family_id uuid not null,
 school_year integer not null check(school_year between 2020 and 2100),
 school_week integer not null check(school_week between 1 and 53),
 task_key text not null check(task_key ~ '^[a-f0-9]{16}$'),
 completed boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid() references auth.users(id),
 primary key(child_id,school_year,school_week,task_key),
 foreign key(child_id,family_id) references public.children(id,family_id) on delete cascade
);
create index if not exists homework_progress_family_idx on public.homework_progress(family_id);

create table if not exists public.family_invitations (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 invitee_email text not null,
 token_hash text not null unique,
 invited_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists family_invites_family_idx on public.family_invitations(family_id);

-- RLS privileges are explicit: no authenticated client may mint a membership
-- or read invite token hashes. These actions go through narrowly scoped RPCs.
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.children enable row level security;
alter table public.homework_progress enable row level security;
alter table public.family_invitations enable row level security;
revoke all on public.families,public.family_members,public.children,
 public.homework_progress,public.family_invitations from anon,authenticated;
grant select on public.families,public.family_members to authenticated;
grant select,insert,update,delete on public.children,public.homework_progress to authenticated;

create or replace function private.parent_family_ids()
 returns setof uuid language sql stable security definer set search_path=''
 as $$
  select m.family_id from public.family_members m
  where m.user_id=(select auth.uid()) and m.role in ('owner','parent')
 $$;
revoke all on function private.parent_family_ids() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.parent_family_ids() to authenticated;

create policy "guardians read families" on public.families for select to authenticated
 using (id in (select private.parent_family_ids()));
create policy "guardians read memberships" on public.family_members for select to authenticated
 using (family_id in (select private.parent_family_ids()));
create policy "guardians read children" on public.children for select to authenticated
 using (family_id in (select private.parent_family_ids()));
create policy "guardians add children" on public.children for insert to authenticated
 with check (family_id in (select private.parent_family_ids()));
create policy "guardians edit children" on public.children for update to authenticated
 using (family_id in (select private.parent_family_ids()))
 with check (family_id in (select private.parent_family_ids()));
create policy "guardians remove children" on public.children for delete to authenticated
 using (family_id in (select private.parent_family_ids()));
create policy "guardians read homework status" on public.homework_progress for select to authenticated
 using (family_id in (select private.parent_family_ids()));
create policy "guardians add homework status" on public.homework_progress for insert to authenticated
 with check (family_id in (select private.parent_family_ids()) and updated_by=(select auth.uid()));
create policy "guardians edit homework status" on public.homework_progress for update to authenticated
 using (family_id in (select private.parent_family_ids()))
 with check (family_id in (select private.parent_family_ids()) and updated_by=(select auth.uid()));
create policy "guardians remove homework status" on public.homework_progress for delete to authenticated
 using (family_id in (select private.parent_family_ids()));

-- Keep audit fields server-controlled, never trust client-supplied timestamps.
create or replace function private.stamp_homework()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.updated_at=now();
 new.updated_by=auth.uid();
 return new;
end;$$;
revoke all on function private.stamp_homework() from public,anon,authenticated;
drop trigger if exists stamp_homework_before_write on public.homework_progress;
create trigger stamp_homework_before_write before insert or update on public.homework_progress
 for each row execute function private.stamp_homework();

-- RPC creates both family and original owner atomically. Nobody can insert
-- arbitrary owner records through the REST API.
create or replace function public.create_family(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
 if auth.uid() is null or nullif(auth.jwt()->>'email','') is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception 'A verified parent email session is required';
 end if;
 if nullif(trim(p_name),'') is null or char_length(trim(p_name))>80 then
   raise exception 'Invalid family name';
 end if;
 insert into public.families(name,created_by) values(trim(p_name),auth.uid()) returning id into fid;
 insert into public.family_members(family_id,user_id,role) values(fid,auth.uid(),'owner');
 return fid;
end;$$;
revoke all on function public.create_family(text) from public,anon;
grant execute on function public.create_family(text) to authenticated;

-- One-time 48h invitations are email-bound, and only parents can create one.
-- Caller manually sends the link; no child invites in phase 1.
create or replace function public.invite_guardian(p_family uuid,p_email text)
returns text language plpgsql security definer set search_path='' as $$
declare secret text; email text;
begin
 if auth.uid() is null or
    not exists (select 1 from public.family_members m where m.family_id=p_family
      and m.user_id=auth.uid() and m.role in ('owner','parent')) then
   raise exception 'Not authorized';
 end if;
 email=lower(trim(coalesce(p_email,'')));
 if char_length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   raise exception 'Invalid email';
 end if;
 secret=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.family_invitations(family_id,invitee_email,token_hash,invited_by,expires_at)
 values(p_family,email,encode(sha256(convert_to(secret,'UTF8')),'hex'),auth.uid(),now()+interval '48 hours');
 return secret;
end;$$;
revoke all on function public.invite_guardian(uuid,text) from public,anon;
grant execute on function public.invite_guardian(uuid,text) to authenticated;

-- Single-use code bound to email in the authenticated JWT.
create or replace function public.accept_guardian_invite(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.family_invitations%rowtype; email text;
begin
 email=lower(trim(coalesce(auth.jwt()->>'email','')));
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or email='' or p_token !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid invitation';
 end if;
 select * into inv from public.family_invitations
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
   and invitee_email=email and used_at is null and expires_at>now()
 for update;
 if not found then raise exception 'Invitation expired or for another email'; end if;
 insert into public.family_members(family_id,user_id,role)
 values(inv.family_id,auth.uid(),'parent')
 on conflict(family_id,user_id) do nothing;
 update public.family_invitations set used_at=now() where id=inv.id;
 return inv.family_id;
end;$$;
revoke all on function public.accept_guardian_invite(text) from public,anon;
grant execute on function public.accept_guardian_invite(text) to authenticated;

-- IMPORTANT: Verify RLS using two real test users in different families before launch.
-- Do not place a service_role key in Netlify client assets or client env vars.

-- Parents may leave a family; only the owner can delete all its child data.
create or replace function public.leave_family(p_family uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(
   select 1 from public.family_members
   where family_id=p_family and user_id=auth.uid() and role='parent'
 ) then raise exception 'Not authorized or owner cannot leave'; end if;
 delete from public.family_members
 where family_id=p_family and user_id=auth.uid() and role='parent';
end;$$;
revoke all on function public.leave_family(uuid) from public,anon;
grant execute on function public.leave_family(uuid) to authenticated;

create or replace function public.delete_family(p_family uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.family_members
  where family_id=p_family and user_id=auth.uid() and role='owner'
 ) then raise exception 'Only the family owner may delete the family'; end if;
 delete from public.families where id=p_family;
end;$$;
revoke all on function public.delete_family(uuid) from public,anon;
grant execute on function public.delete_family(uuid) to authenticated;

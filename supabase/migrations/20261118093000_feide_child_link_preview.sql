-- Feide PR 2 (PREVIEW/TEST ONLY until explicitly reviewed and applied).
-- Authenticated guardians must pass existing children RLS via the Netlify backend.
-- No anon/authenticated Data API privileges: only service_role can read/write.
create table public.feide_link_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  subject_hash text check (subject_hash is null or subject_hash ~ '^[a-f0-9]{64}$'),
  confirmation_hash text check (confirmation_hash is null or confirmation_hash ~ '^[a-f0-9]{64}$'),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  constraint feide_link_requests_child_fkey foreign key (child_id,family_id)
    references public.children(id,family_id) on delete cascade,
  constraint feide_link_requests_expiry check (expires_at > created_at),
  constraint feide_link_requests_claim_both check ((subject_hash is null) = (confirmation_hash is null)),
  constraint feide_link_requests_approved_only_claimed check (approved_at is null or subject_hash is not null)
);
create index feide_link_requests_child_idx
  on public.feide_link_requests(child_id,created_by,created_at desc);
create index feide_link_requests_expires_idx on public.feide_link_requests(expires_at);

create table public.feide_child_links (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  linked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint feide_child_links_child_fkey foreign key (child_id,family_id)
    references public.children(id,family_id) on delete cascade
);
-- Exactly one active Feide subject per child and one active child per subject.
create unique index feide_child_links_subject_active_uidx
  on public.feide_child_links(subject_hash) where revoked_at is null;
create unique index feide_child_links_child_active_uidx
  on public.feide_child_links(child_id) where revoked_at is null;
create index feide_child_links_family_idx on public.feide_child_links(family_id,child_id);

alter table public.feide_link_requests enable row level security;
alter table public.feide_child_links enable row level security;
revoke all on public.feide_link_requests,public.feide_child_links from public,anon,authenticated;
grant select,insert,update,delete on public.feide_link_requests,public.feide_child_links to service_role;
comment on table public.feide_link_requests is '10-minute guardian-initiated Feide identity linking; service-only and never grants child access.';
comment on table public.feide_child_links is 'Approved, pseudonymized Feide identity to child mapping; service-only, no automatic data access.';
notify pgrst, 'reload schema';

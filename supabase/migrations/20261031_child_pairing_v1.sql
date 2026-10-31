-- Child device pairing: secure, short-lived one-time link and revocable read-only sessions.
-- Intentionally not applied to production until reviewed and tested.
create table if not exists public.child_pairings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  constraint child_pairings_child_owner foreign key (child_id,family_id)
    references public.children(id,family_id) on delete cascade,
  constraint child_pairings_expiry check (expires_at > created_at)
);
create index if not exists child_pairings_expiry_idx on public.child_pairings(expires_at);

create table if not exists public.child_device_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid not null,
  secret_hash text not null unique check (secret_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  constraint child_sessions_child_owner foreign key (child_id,family_id)
    references public.children(id,family_id) on delete cascade,
  constraint child_sessions_expiry check (expires_at > created_at)
);
create index if not exists child_sessions_lookup_idx
  on public.child_device_sessions(child_id,revoked_at,expires_at);

alter table public.child_pairings enable row level security;
alter table public.child_device_sessions enable row level security;
revoke all on public.child_pairings from public,anon,authenticated;
revoke all on public.child_device_sessions from public,anon,authenticated;
-- Only Netlify server functions holding the secret service credential can
-- issue/redeem/check/revoke opaque tokens. No public or authenticated Data API
-- user can query these records. Parent identity is checked against Supabase Auth
-- and children RLS on EVERY parent request before using service privileges.
comment on table public.child_pairings is 'One-use 10-minute capability, hashed at rest; service-only.';
comment on table public.child_device_sessions is 'Revocable child-only read sessions; hashed at rest; service-only.';
notify pgrst, 'reload schema';

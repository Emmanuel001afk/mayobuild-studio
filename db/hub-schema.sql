-- ===========================================================================
-- MAYOBUILD / AEM AI CENTRAL HUB — run this whole file once in the
-- Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> Run).
-- Safe to re-run: everything uses IF NOT EXISTS / CREATE OR REPLACE.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. API KEYS  (the "AM_" keys your other websites use to call /api/hub)
--    Only the SHA-256 hash is stored, never the key itself.
-- ---------------------------------------------------------------------------
create table if not exists public.hub_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_prefix text not null default 'AM',
  key_hash text not null unique,
  scope text not null default 'restricted' check (scope in ('owner','restricted')),
  rate_limit_per_hour integer not null default 50,
  revoked boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

grant all on public.hub_api_keys to service_role;
alter table public.hub_api_keys enable row level security;
-- No anon/authenticated policies on purpose: keys are only ever touched
-- server-side through the service role.

-- ---------------------------------------------------------------------------
-- 2. USAGE LOG (drives the per-key hourly rate limit)
-- ---------------------------------------------------------------------------
create table if not exists public.hub_api_usage (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.hub_api_keys(id) on delete cascade,
  called_at timestamptz not null default now()
);
create index if not exists hub_api_usage_key_time on public.hub_api_usage (key_id, called_at desc);

grant all on public.hub_api_usage to service_role;
alter table public.hub_api_usage enable row level security;

-- ---------------------------------------------------------------------------
-- 3. MEMORY (RAG) — every good hosted answer is distilled into here so the
--    small local model can look it up later instead of reasoning from zero.
-- ---------------------------------------------------------------------------
create table if not exists public.hub_memory (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'distilled',
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists hub_memory_fts
  on public.hub_memory using gin (to_tsvector('english', content));

grant all on public.hub_memory to service_role;
alter table public.hub_memory enable row level security;

-- Keyword half of the memory fusion search used by ai-hub-core.ts.
create or replace function public.hub_memory_keyword_search(q text)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.hub_memory m
  where to_tsvector('english', m.content) @@ plainto_tsquery('english', q)
  order by ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', q)) desc
  limit 20
$$;

-- ---------------------------------------------------------------------------
-- 4. CONNECTED SITES — every website AEM AI is allowed to work on.
--    Secrets are stored as Vault secret IDs, never as plain text.
-- ---------------------------------------------------------------------------
create table if not exists public.connected_sites (
  id uuid primary key default gen_random_uuid(),
  site_name text not null unique,
  is_self boolean not null default false,
  github_repo text,
  github_token_secret_id uuid,
  deploy_platform text,
  deploy_token_secret_id uuid,
  supabase_project_ref text,
  supabase_service_key_secret_id uuid,
  created_at timestamptz not null default now()
);

grant all on public.connected_sites to service_role;
alter table public.connected_sites enable row level security;

insert into public.connected_sites (site_name, is_self)
values ('mayobuild-studio', true)
on conflict (site_name) do nothing;

-- Vault reader used by aem-tools.server.ts (no-op safe if Vault is unused).
create or replace function public.read_vault_secret(secret_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where id = secret_id;
  return v;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. LOCAL-MODEL BRIDGE — the job queue that lets the hub talk to the
--    browser tab running your .gguf model (no real server required).
-- ---------------------------------------------------------------------------
create table if not exists public.hub_devices (
  device_id text primary key,
  label text,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.hub_local_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  prompt text not null,
  answer text,
  status text not null default 'pending'
    check (status in ('pending','working','done','error','expired')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists hub_local_jobs_queue
  on public.hub_local_jobs (device_id, status, created_at);

grant all on public.hub_devices to service_role;
grant all on public.hub_local_jobs to service_role;
alter table public.hub_devices enable row level security;
alter table public.hub_local_jobs enable row level security;

-- ===========================================================================
-- Done. Nothing else to configure — the app reaches all of this through the
-- service role from the server side only.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 6. SHARED AI TUNNEL — keyless-to-the-user transport for native APKs.
--    Each app installation receives a random session token automatically.
--    The token is stored only as a hash here; users never enter an AM_ key.
--    Multiple APKs share this endpoint and identify themselves with app_id.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_tunnel_devices (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  device_id text not null,
  device_label text,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked boolean not null default false,
  request_count integer not null default 0,
  unique (app_id, device_id)
);
create index if not exists ai_tunnel_devices_app on public.ai_tunnel_devices (app_id, last_seen_at desc);
grant all on public.ai_tunnel_devices to service_role;
alter table public.ai_tunnel_devices enable row level security;

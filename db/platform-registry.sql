-- MAYOBUILD STUDIO: portable platform registry + diagnostic records.
-- Safe to run repeatedly in the Central Hub Supabase project.
-- This schema belongs ONLY to Central Hub, never to AEM Store.

create extension if not exists pgcrypto;

create table if not exists public.platform_registry (
  platform_id text primary key,
  name text not null,
  platform_type text not null default 'other'
    check (platform_type in ('android','web','service','desktop','other')),
  package_name text,
  version text,
  api_version text not null default '1',
  capabilities text[] not null default '{}',
  status text not null default 'registered'
    check (status in ('registered','active','attention','offline','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.platform_registry_keys (
  id uuid primary key default gen_random_uuid(),
  platform_id text not null references public.platform_registry(platform_id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists platform_registry_keys_platform
  on public.platform_registry_keys (platform_id, created_at desc);

create table if not exists public.platform_diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  platform_id text not null references public.platform_registry(platform_id) on delete cascade,
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info','warning','error','critical')),
  summary text not null,
  app_version text,
  device_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_diagnostics_platform_time
  on public.platform_diagnostic_events (platform_id, created_at desc);
create index if not exists platform_diagnostics_severity_time
  on public.platform_diagnostic_events (severity, created_at desc);

grant all on public.platform_registry to service_role;
grant all on public.platform_registry_keys to service_role;
grant all on public.platform_diagnostic_events to service_role;
alter table public.platform_registry enable row level security;
alter table public.platform_registry_keys enable row level security;
alter table public.platform_diagnostic_events enable row level security;

-- No anon/authenticated policies: all access is through server-side service-role
-- code after checking an owner key or a platform-specific token.

-- ============================================================
-- Mayobuild Studio — schema for YOUR Supabase project
-- Run this once in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Roles
do $$ begin
  create type public.app_role as enum ('owner','admin','editor','viewer');
exception when duplicate_object then null; end $$;

-- Profiles (auto-created on signup via trigger below)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Workspaces (one per user by default)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Workspace',
  created_at timestamptz default now()
);

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('website','mobile')),
  description text,
  preview_html text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Collaborators
create table if not exists public.project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text not null,
  role public.app_role not null default 'editor',
  accepted_at timestamptz,
  created_at timestamptz default now(),
  unique (project_id, invited_email)
);

-- Generation log (router calls)
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  task text not null,
  provider text not null,
  model text,
  prompt text,
  output text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  ok boolean default true,
  error text,
  created_at timestamptz default now()
);

-- Mobile build artifacts (zip URLs)
create table if not exists public.mobile_builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz default now()
);

-- Auto-create profile + default workspace on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  insert into public.workspaces (owner_id, name)
  values (new.id, 'My Workspace')
  returning id into ws_id;

  -- Link any pending collaborator invites by email
  update public.project_collaborators
    set user_id = new.id, accepted_at = now()
    where invited_email = new.email and user_id is null;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========== RLS ===========
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.project_collaborators enable row level security;
alter table public.generations enable row level security;
alter table public.mobile_builds enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Profiles
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid());

-- Workspaces
drop policy if exists "ws read own" on public.workspaces;
create policy "ws read own" on public.workspaces for select to authenticated using (owner_id = auth.uid());
drop policy if exists "ws write own" on public.workspaces;
create policy "ws write own" on public.workspaces for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Projects (owner OR accepted collaborator)
create or replace function public.has_project_access(_pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p where p.id = _pid and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_collaborators c
    where c.project_id = _pid and c.user_id = auth.uid() and c.accepted_at is not null
  );
$$;

drop policy if exists "projects read access" on public.projects;
create policy "projects read access" on public.projects for select to authenticated using (public.has_project_access(id));
drop policy if exists "projects write owner" on public.projects;
create policy "projects write owner" on public.projects for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Collaborators
drop policy if exists "collab read access" on public.project_collaborators;
create policy "collab read access" on public.project_collaborators for select to authenticated using (public.has_project_access(project_id) or user_id = auth.uid());
drop policy if exists "collab write owner" on public.project_collaborators;
create policy "collab write owner" on public.project_collaborators for all to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
);

-- Generations / mobile_builds: project access
drop policy if exists "gen read" on public.generations;
create policy "gen read" on public.generations for select to authenticated using (project_id is null or public.has_project_access(project_id));
drop policy if exists "gen insert own" on public.generations;
create policy "gen insert own" on public.generations for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "mb read" on public.mobile_builds;
create policy "mb read" on public.mobile_builds for select to authenticated using (public.has_project_access(project_id));
drop policy if exists "mb insert own" on public.mobile_builds;
create policy "mb insert own" on public.mobile_builds for insert to authenticated with check (user_id = auth.uid());

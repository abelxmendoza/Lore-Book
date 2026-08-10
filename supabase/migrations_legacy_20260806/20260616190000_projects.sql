-- Projects Book: canonical project entities (mirrors the locations authority model).
-- One canonical row per project; people_places/omega project mentions resolve to this
-- via projectMergeService.resolveCanonicalProjectId (same pattern as locations).

create table if not exists public.projects (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  name                      text not null,
  normalized_name           text not null,
  type                      text default 'project',
  status                    text default 'active',         -- active | paused | completed | abandoned
  description               text,
  summary                   text,
  tags                      text[] not null default '{}',
  metadata                  jsonb not null default '{}'::jsonb,
  importance_score          numeric default 50,
  associated_character_ids  uuid[] not null default '{}',
  associated_location_ids   uuid[] not null default '{}',
  started_at                timestamptz,
  ended_at                  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_normalized_name_idx on public.projects(user_id, normalized_name);
create index if not exists projects_status_idx on public.projects(user_id, status);

alter table public.projects enable row level security;

drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;

create policy projects_select on public.projects for select using (auth.uid() = user_id);
create policy projects_insert on public.projects for insert with check (auth.uid() = user_id);
create policy projects_update on public.projects for update using (auth.uid() = user_id);
create policy projects_delete on public.projects for delete using (auth.uid() = user_id);

comment on table public.projects is 'Canonical project entities — the Projects Book authority (mirrors locations).';

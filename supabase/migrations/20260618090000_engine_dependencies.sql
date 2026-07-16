-- Engine dependency graph
-- Keeps runtime engine ordering data available through PostgREST.

create table if not exists public.engine_dependencies (
  engine_name text not null,
  depends_on text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (engine_name, depends_on),
  constraint engine_dependencies_no_self_reference check (engine_name <> depends_on)
);

-- Table may already exist from 20250223000077 without updated_at.
alter table public.engine_dependencies add column if not exists updated_at timestamptz default now();

create index if not exists idx_engine_dependencies_engine_name
  on public.engine_dependencies(engine_name);

create index if not exists idx_engine_dependencies_depends_on
  on public.engine_dependencies(depends_on);

alter table public.engine_dependencies enable row level security;

revoke all on table public.engine_dependencies from anon, authenticated;
grant select, insert, update, delete on table public.engine_dependencies to service_role;


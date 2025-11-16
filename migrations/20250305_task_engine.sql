-- Task engine tables for Lore Keeper
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'admin',
  intent text,
  source text not null default 'manual',
  status text not null default 'incomplete',
  priority integer not null default 3,
  urgency integer not null default 1,
  impact integer not null default 1,
  effort integer not null default 0,
  due_date timestamptz,
  external_id text,
  external_source text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, external_source, external_id)
);

create index if not exists tasks_user_status_idx on public.tasks(user_id, status);
create index if not exists tasks_due_idx on public.tasks(user_id, due_date);

create table if not exists public.task_sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  last_cursor text,
  last_synced_at timestamptz,
  status text default 'idle',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  event_type text not null,
  description text,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

create index if not exists task_events_user_idx on public.task_events(user_id, created_at desc);

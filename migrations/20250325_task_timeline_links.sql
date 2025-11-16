-- Task timeline + memory bridge tables for Lore Keeper
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  tags text[] default array[]::text[],
  occurred_at timestamptz not null default now(),
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists timeline_events_user_idx on public.timeline_events(user_id, occurred_at desc);
create index if not exists timeline_events_task_idx on public.timeline_events(task_id);

create table if not exists public.task_memory_bridges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  timeline_event_id uuid references public.timeline_events(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  bridge_type text not null default 'task_timeline',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists task_memory_bridges_user_idx on public.task_memory_bridges(user_id, created_at desc);
create index if not exists task_memory_bridges_task_idx on public.task_memory_bridges(task_id);
create index if not exists task_memory_bridges_timeline_idx on public.task_memory_bridges(timeline_event_id);

-- Complete database setup for Lore Keeper
-- Run this script to create all necessary tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists "pgvector";

-- Journal Entries Table
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date timestamptz not null default now(),
  content text not null,
  tags text[] default '{}',
  chapter_id uuid,
  mood text,
  summary text,
  source text not null default 'manual',
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists journal_entries_user_id_idx on public.journal_entries(user_id);
create index if not exists journal_entries_date_idx on public.journal_entries(date desc);
create index if not exists journal_entries_chapter_id_idx on public.journal_entries(chapter_id);
create index if not exists journal_entries_tags_idx on public.journal_entries using gin(tags);
create index if not exists journal_entries_embedding_idx on public.journal_entries using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Chapters Table
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  start_date timestamptz not null,
  end_date timestamptz,
  description text,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists chapters_user_id_idx on public.chapters(user_id);
create index if not exists chapters_start_date_idx on public.chapters(start_date desc);

-- Characters Table
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  alias text[],
  pronouns text,
  archetype text,
  role text,
  status text default 'active',
  first_appearance date,
  summary text,
  tags text[] default '{}',
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

create index if not exists characters_user_id_idx on public.characters(user_id);
create index if not exists characters_name_idx on public.characters(name);

-- Character Relationships Table
create table if not exists public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_character_id uuid references public.characters(id) on delete cascade,
  target_character_id uuid references public.characters(id) on delete cascade,
  relationship_type text not null,
  closeness_score smallint check (closeness_score between -10 and 10),
  status text default 'active',
  summary text,
  last_shared_memory_id uuid references public.journal_entries(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, source_character_id, target_character_id, relationship_type)
);

create index if not exists character_relationships_user_id_idx on public.character_relationships(user_id);
create index if not exists character_relationships_source_idx on public.character_relationships(source_character_id);
create index if not exists character_relationships_target_idx on public.character_relationships(target_character_id);

-- Character Memories Table
create table if not exists public.character_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id uuid references public.characters(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  chapter_id uuid references public.chapters(id),
  role text,
  emotion text,
  perspective text,
  summary text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, character_id, journal_entry_id)
);

create index if not exists character_memories_user_id_idx on public.character_memories(user_id);
create index if not exists character_memories_character_id_idx on public.character_memories(character_id);
create index if not exists character_memories_entry_id_idx on public.character_memories(journal_entry_id);

-- Tasks Table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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
create index if not exists tasks_priority_idx on public.tasks(priority);

-- Task Events Table
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id uuid references public.tasks(id) on delete cascade,
  event_type text not null,
  description text,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

create index if not exists task_events_user_idx on public.task_events(user_id, created_at desc);
create index if not exists task_events_task_idx on public.task_events(task_id);

-- Daily Summaries Table
create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  summary text,
  tags text[] default '{}',
  created_at timestamptz default now(),
  unique(user_id, date)
);

create index if not exists daily_summaries_user_date_idx on public.daily_summaries(user_id, date desc);

-- Memoir Outlines Table
create table if not exists public.memoir_outlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  structure jsonb not null default '{}'::jsonb,
  language_style jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create index if not exists memoir_outlines_user_id_idx on public.memoir_outlines(user_id);

-- Original Documents Table
create table if not exists public.original_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  content text not null,
  source text not null,
  file_type text,
  file_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists original_documents_user_id_idx on public.original_documents(user_id);
create index if not exists original_documents_source_idx on public.original_documents(source);

-- People Places Table (legacy support)
create table if not exists public.people_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null check (type in ('person', 'place')),
  first_mentioned_at timestamptz,
  last_mentioned_at timestamptz,
  total_mentions integer default 0,
  related_entries uuid[] default '{}',
  corrected_names text[] default '{}',
  relationship_counts jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name, type)
);

create index if not exists people_places_user_id_idx on public.people_places(user_id);
create index if not exists people_places_type_idx on public.people_places(type);

-- Semantic search function
create or replace function public.match_journal_entries(
  user_uuid uuid,
  query_embedding vector(1536),
  match_threshold float default 0.4,
  match_count int default 20
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  date timestamptz,
  tags text[],
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    journal_entries.id,
    journal_entries.user_id,
    journal_entries.content,
    journal_entries.date,
    journal_entries.tags,
    1 - (journal_entries.embedding <=> query_embedding) as similarity
  from journal_entries
  where journal_entries.user_id = user_uuid
    and journal_entries.embedding is not null
    and 1 - (journal_entries.embedding <=> query_embedding) > match_threshold
  order by journal_entries.embedding <=> query_embedding
  limit match_count;
end;
$$;


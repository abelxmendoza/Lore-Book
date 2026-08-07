-- Enable pgvector for semantic search
create extension if not exists vector;

-- Add embedding column to journal entries
alter table if exists public.journal_entries
  add column if not exists embedding vector(1536);
alter table if exists public.journal_entries
  add column if not exists year_shard int;

update public.journal_entries
  set year_shard = extract(year from date)
  where year_shard is null;

-- Speed up similarity queries
create index if not exists journal_entries_embedding_idx
  on public.journal_entries using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists journal_entries_year_shard_idx
  on public.journal_entries (year_shard);

-- Helper function for semantic matches scoped per user.
-- Must DROP first: earlier setup_all_tables defines a different OUT row type,
-- and CREATE OR REPLACE cannot change RETURNS TABLE shape (42P13).
drop function if exists public.match_journal_entries(uuid, vector, float, int);
drop function if exists public.match_journal_entries(uuid, vector(1536), float, int);

create function public.match_journal_entries(
  user_uuid uuid,
  query_embedding vector,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  user_id uuid,
  date timestamptz,
  content text,
  tags text[],
  chapter_id uuid,
  mood text,
  summary text,
  source text,
  metadata jsonb,
  embedding vector,
  similarity float
)
language sql
stable
as $$
  select
    je.id,
    je.user_id,
    je.date,
    je.content,
    je.tags,
    je.chapter_id,
    je.mood,
    je.summary,
    je.source,
    je.metadata,
    je.embedding,
    1 - (je.embedding <=> query_embedding) as similarity
  from public.journal_entries je
  where je.user_id = user_uuid
    and je.embedding is not null
    and (match_threshold is null or je.embedding <=> query_embedding < match_threshold)
  order by je.embedding <=> query_embedding
  limit match_count;
$$;

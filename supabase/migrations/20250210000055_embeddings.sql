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

-- Helper function for semantic matches scoped per user
create or replace function public.match_journal_entries(
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
  select *, 1 - (embedding <=> query_embedding) as similarity
  from public.journal_entries
  where user_id = user_uuid
    and embedding is not null
    and (match_threshold is null or embedding <=> query_embedding < match_threshold)
  order by embedding <=> query_embedding
  limit match_count;
$$;

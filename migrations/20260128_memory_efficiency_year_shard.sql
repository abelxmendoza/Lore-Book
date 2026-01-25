-- Memory efficiency: year_shard composite index and match_journal_entries filter
-- Enables partition pruning and narrower scans for recent queries

-- Composite index for (user_id, year_shard) to support filtered match_journal_entries
CREATE INDEX IF NOT EXISTS journal_entries_user_year_shard_idx
  ON public.journal_entries (user_id, year_shard);

-- Extend match_journal_entries with optional p_year_shard_min for recent-only search
CREATE OR REPLACE FUNCTION public.match_journal_entries(
  user_uuid uuid,
  query_embedding vector,
  match_threshold float,
  match_count int,
  p_year_shard_min int default null
)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
AS $$
  SELECT
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
    1 - (je.embedding <=> query_embedding) AS similarity
  FROM public.journal_entries je
  WHERE je.user_id = user_uuid
    AND je.embedding IS NOT NULL
    AND (match_threshold IS NULL OR je.embedding <=> query_embedding < match_threshold)
    AND (p_year_shard_min IS NULL OR je.year_shard >= p_year_shard_min)
  ORDER BY je.embedding <=> query_embedding
  LIMIT match_count;
$$;

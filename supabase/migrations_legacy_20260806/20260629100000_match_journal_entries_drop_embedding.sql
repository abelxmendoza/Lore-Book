-- =====================================================
-- EGRESS FIX — match_journal_entries must NOT return the 1536-dim embedding.
--
-- The `embedding` column serializes to ~20–40 KB/row as JSON (what PostgREST
-- returns = what Supabase bills as egress). It was being shipped on every
-- semantic search even though NO caller reads it from this RPC's result set:
--
--   - chat/memoryRetriever.searchRelevantEntries   → uses id + similarity only
--       (MMR diversity reads embeddings from a *separate* select, not this RPC)
--   - rag/multiVectorRetrieval.searchByEmbedding    → consumer uses id + similarity
--   - memoryService.semanticSearchEntries           → embedding not consumed
--   - consolidation/similarityDetector (k-NN loop)  → uses row.id only, and runs
--       this RPC up to 150× per consolidation with match_count 6 (~900 vector
--       rows of pure egress per run; embeddings come from its own select)
--
-- Dropping `embedding` from RETURNS TABLE removes that egress with ZERO behavior
-- change. The function name + argument signature are unchanged, so every caller
-- keeps working without code edits.
--
-- Two overloads exist in the DB and both must go:
--   * 4-arg  (20250210000055_embeddings.sql)            — still returned embedding
--   * 5-arg  (20260128000151_memory_efficiency_year_shard.sql, p_year_shard_min)
-- CREATE OR REPLACE cannot change a function's return type, so we DROP then
-- recreate a single unified 5-arg version (the optional p_year_shard_min default
-- transparently covers the 4-arg call sites).
--
-- Mirrors 20260128000151 exactly, minus the vector column.
-- =====================================================

DROP FUNCTION IF EXISTS public.match_journal_entries(uuid, vector, float, int);
DROP FUNCTION IF EXISTS public.match_journal_entries(uuid, vector, float, int, int);

CREATE FUNCTION public.match_journal_entries(
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
    1 - (je.embedding <=> query_embedding) AS similarity
  FROM public.journal_entries je
  WHERE je.user_id = user_uuid
    AND je.embedding IS NOT NULL
    AND (match_threshold IS NULL OR je.embedding <=> query_embedding < match_threshold)
    AND (p_year_shard_min IS NULL OR je.year_shard >= p_year_shard_min)
  ORDER BY je.embedding <=> query_embedding
  LIMIT match_count;
$$;

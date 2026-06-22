-- =====================================================
-- Response Compiler — whole-lore claim grounding
-- =====================================================
-- The existing find_similar_claims_semantic() is scoped to a single entity_id,
-- so it can't answer "does anything in this user's canon support this assistant
-- claim?". match_omega_claims() searches a user's ENTIRE active claim set by
-- vector similarity, letting the Response Compiler ground assistant statements
-- against established lore (not just the current thread). Uses the existing HNSW
-- index on omega_claims.embedding (omega_claims_embedding_hnsw).

CREATE OR REPLACE FUNCTION match_omega_claims(
  query_embedding vector(1536),
  user_id_param uuid,
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  text text,
  confidence float,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.entity_id,
    c.text,
    c.confidence,
    1 - (c.embedding <=> query_embedding) as similarity
  FROM omega_claims c
  WHERE c.user_id = user_id_param
    AND c.is_active = true
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

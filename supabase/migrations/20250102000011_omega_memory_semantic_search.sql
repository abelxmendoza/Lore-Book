-- =====================================================
-- OMEGA MEMORY ENGINE — Semantic Search Functions
-- =====================================================

-- Function for semantic entity matching
CREATE OR REPLACE FUNCTION match_omega_entities(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  user_id_param uuid,
  type_param text
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  primary_name text,
  aliases text[],
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.user_id,
    e.type,
    e.primary_name,
    e.aliases,
    e.created_at,
    e.updated_at,
    1 - (e.embedding <=> query_embedding) as similarity
  FROM omega_entities e
  WHERE e.user_id = user_id_param
    AND e.type = type_param
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function for semantic claim similarity search
CREATE OR REPLACE FUNCTION find_similar_claims_semantic(
  query_embedding vector(1536),
  entity_id_param uuid,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  text text,
  confidence float,
  similarity float
)
LANGUAGE plpgsql
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
  WHERE c.entity_id = entity_id_param
    AND c.is_active = true
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


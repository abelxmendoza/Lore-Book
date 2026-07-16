-- Engine Manifest System V1
-- Tracks all engines, stores blueprints, and enables semantic search

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Engine Manifest Table
CREATE TABLE IF NOT EXISTS public.engine_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('core', 'analytics', 'specialized', 'domain')),
  status TEXT NOT NULL DEFAULT 'implemented' CHECK (status IN ('planned', 'in_progress', 'implemented')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blueprint Storage Table
CREATE TABLE IF NOT EXISTS public.engine_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id UUID NOT NULL REFERENCES engine_manifest(id) ON DELETE CASCADE,
  blueprint TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Embedding Table
CREATE TABLE IF NOT EXISTS public.engine_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id UUID NOT NULL REFERENCES engine_manifest(id) ON DELETE CASCADE,
  embedding VECTOR(1536),
  tokens INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engine_manifest_category ON public.engine_manifest(category);
CREATE INDEX IF NOT EXISTS idx_engine_manifest_status ON public.engine_manifest(status);
CREATE INDEX IF NOT EXISTS idx_engine_manifest_name ON public.engine_manifest(name);

CREATE INDEX IF NOT EXISTS idx_engine_blueprints_engine ON public.engine_blueprints(engine_id);
CREATE INDEX IF NOT EXISTS idx_engine_blueprints_created ON public.engine_blueprints(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_embeddings_engine ON public.engine_embeddings(engine_id);
CREATE INDEX IF NOT EXISTS idx_engine_embeddings_vector ON public.engine_embeddings 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- Function for semantic search across engines
CREATE OR REPLACE FUNCTION semantic_search_across_engines(
  p_query_embedding VECTOR(1536),
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  engine_id UUID,
  engine_name TEXT,
  category TEXT,
  status TEXT,
  version TEXT,
  description TEXT,
  similarity FLOAT,
  blueprint_preview TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    em.id,
    em.name,
    em.category,
    em.status,
    em.version,
    em.description,
    1 - (ee.embedding <=> p_query_embedding) as similarity,
    LEFT(eb.blueprint, 200) as blueprint_preview
  FROM engine_embeddings ee
  JOIN engine_manifest em ON em.id = ee.engine_id
  LEFT JOIN LATERAL (
    SELECT blueprint 
    FROM engine_blueprints 
    WHERE engine_id = em.id 
    ORDER BY created_at DESC 
    LIMIT 1
  ) eb ON true
  WHERE ee.embedding IS NOT NULL
  ORDER BY ee.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS (if needed for multi-user, but for now we'll keep it open for system use)
-- For V1, we'll skip RLS since this is system-level data


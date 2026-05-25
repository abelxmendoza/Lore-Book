-- Embeddings Cache Table
-- Purpose: Dedicated table for caching embeddings to reduce API costs
-- Expected Impact: 30-40% cost reduction on embeddings

CREATE TABLE IF NOT EXISTS embeddings_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT UNIQUE NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_cache_hash ON embeddings_cache(content_hash);

-- Vector index for similarity search (if pgvector extension is available)
-- Note: This requires the vector extension to be enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE INDEX IF NOT EXISTS idx_embeddings_cache_embedding 
    ON embeddings_cache USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE embeddings_cache IS 'Cache for text embeddings to reduce API costs. Uses content hash as key.';
COMMENT ON COLUMN embeddings_cache.content_hash IS 'SHA256 hash of normalized content (lowercase, trimmed, max 8000 chars)';
COMMENT ON COLUMN embeddings_cache.embedding IS 'Vector embedding (1536 dimensions)';
COMMENT ON COLUMN embeddings_cache.access_count IS 'Number of times this embedding has been accessed';
COMMENT ON COLUMN embeddings_cache.last_accessed_at IS 'Last time this embedding was accessed (for cache warming)';

-- Entity Resolution Cache Table
-- Purpose: Cache resolved entities to reduce API costs and improve consistency
-- Expected Impact: 50-70% faster entity resolution, 30% cost reduction

CREATE TABLE IF NOT EXISTS entity_resolution_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  resolved_entity_id UUID,
  entity_type TEXT,
  confidence NUMERIC(3,2),
  aliases TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entity_name)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_entity_resolution_user_name ON entity_resolution_cache(user_id, entity_name);
CREATE INDEX IF NOT EXISTS idx_entity_resolution_entity_id ON entity_resolution_cache(resolved_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_resolution_user_type ON entity_resolution_cache(user_id, entity_type);

-- Add comment
COMMENT ON TABLE entity_resolution_cache IS 'Cache for entity resolution to reduce API costs and improve consistency';
COMMENT ON COLUMN entity_resolution_cache.entity_name IS 'Original entity name as mentioned by user';
COMMENT ON COLUMN entity_resolution_cache.resolved_entity_id IS 'Resolved entity ID (character, location, etc.)';
COMMENT ON COLUMN entity_resolution_cache.aliases IS 'Array of known aliases for this entity';
COMMENT ON COLUMN entity_resolution_cache.access_count IS 'Number of times this resolution has been accessed';
COMMENT ON COLUMN entity_resolution_cache.last_accessed_at IS 'Last time this resolution was accessed';

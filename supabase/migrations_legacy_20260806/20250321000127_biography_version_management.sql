-- Biography Version Management Migration
-- Adds version linking, memory snapshots, and content stats caching

-- Add version management columns to biographies table
ALTER TABLE biographies
  ADD COLUMN IF NOT EXISTS base_biography_id UUID REFERENCES biographies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS memory_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atom_snapshot_hash TEXT;

-- Add content stats cache to narrative_graphs table
ALTER TABLE narrative_graphs
  ADD COLUMN IF NOT EXISTS content_stats_cache JSONB;

-- Indexes for version queries
CREATE INDEX IF NOT EXISTS idx_biographies_base_id ON biographies(base_biography_id) WHERE base_biography_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biographies_version_link ON biographies(user_id, base_biography_id) WHERE base_biography_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biographies_memory_snapshot ON biographies(user_id, memory_snapshot_at DESC);

-- Comments
COMMENT ON COLUMN biographies.base_biography_id IS 'Reference to base biography for version linking (null for base versions)';
COMMENT ON COLUMN biographies.memory_snapshot_at IS 'Timestamp when memory was queried for this biography generation';
COMMENT ON COLUMN biographies.atom_snapshot_hash IS 'Hash of atoms used for reproducibility and version comparison';
COMMENT ON COLUMN narrative_graphs.content_stats_cache IS 'Cached content statistics for quick access';

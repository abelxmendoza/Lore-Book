-- Biography Generation System
-- Stores NarrativeGraphs and generated Biographies

-- Narrative Graphs table (precomputed atom graphs)
CREATE TABLE IF NOT EXISTS narrative_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  graph_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Biographies table (Lorebooks are compiled artifacts, not sources of truth)
CREATE TABLE IF NOT EXISTS biographies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  domain TEXT,
  version TEXT, -- 'main' | 'safe' | 'explicit' | 'private' (build flag)
  is_core_lorebook BOOLEAN DEFAULT false, -- Core saved edition vs ephemeral query
  lorebook_name TEXT, -- User-given name for Core Lorebooks
  lorebook_version INTEGER DEFAULT 1, -- Version number for Core Lorebooks
  biography_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_narrative_graphs_user_id ON narrative_graphs(user_id);
CREATE INDEX IF NOT EXISTS idx_biographies_user_id ON biographies(user_id);
CREATE INDEX IF NOT EXISTS idx_biographies_domain ON biographies(domain);
CREATE INDEX IF NOT EXISTS idx_biographies_created_at ON biographies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_biographies_core_lorebook ON biographies(user_id, is_core_lorebook) WHERE is_core_lorebook = true;
CREATE INDEX IF NOT EXISTS idx_biographies_lorebook_name ON biographies(user_id, lorebook_name) WHERE lorebook_name IS NOT NULL;

-- RLS policies
ALTER TABLE narrative_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE biographies ENABLE ROW LEVEL SECURITY;

-- Users can only see their own graphs
CREATE POLICY "Users can view their own narrative graphs"
  ON narrative_graphs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert/update graphs
CREATE POLICY "Service role can manage narrative graphs"
  ON narrative_graphs
  FOR ALL
  USING (true);

-- Users can only see their own biographies
CREATE POLICY "Users can view their own biographies"
  ON biographies
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own biographies
CREATE POLICY "Users can create their own biographies"
  ON biographies
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can manage biographies
CREATE POLICY "Service role can manage biographies"
  ON biographies
  FOR ALL
  USING (true);

-- Comments
COMMENT ON TABLE narrative_graphs IS 'Precomputed narrative graphs with atoms and edges for fast biography generation';
COMMENT ON TABLE biographies IS 'Generated biographies from NarrativeAtoms';
COMMENT ON COLUMN narrative_graphs.graph_data IS 'JSONB containing NarrativeGraph structure';
COMMENT ON COLUMN biographies.biography_data IS 'JSONB containing Biography structure';

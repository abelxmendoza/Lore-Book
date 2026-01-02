-- Paracosm Engine V1
-- Identifies and structures imagined worlds, scenarios, people, and mental simulations

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Paracosm Elements Table
CREATE TABLE IF NOT EXISTS public.paracosm_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'imagined_person',
    'imagined_group',
    'imagined_future',
    'alternate_self',
    'fantasy_scenario',
    'inner_world',
    'simulation',
    'fictional_entity',
    'fictional_location',
    'fear_projection',
    'ideal_projection',
    'daydream',
    'nightmare'
  )),
  text TEXT NOT NULL,
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  vividness NUMERIC CHECK (vividness >= 0 AND vividness <= 1),
  emotional_intensity NUMERIC CHECK (emotional_intensity >= 0 AND emotional_intensity <= 1),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paracosm Clusters Table
CREATE TABLE IF NOT EXISTS public.paracosm_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  themes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paracosm Cluster Elements (many-to-many)
CREATE TABLE IF NOT EXISTS public.paracosm_cluster_elements (
  cluster_id UUID NOT NULL REFERENCES paracosm_clusters(id) ON DELETE CASCADE,
  element_id UUID NOT NULL REFERENCES paracosm_elements(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, element_id)
);

-- Paracosm Worlds Table
CREATE TABLE IF NOT EXISTS public.paracosm_worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paracosm World Clusters (many-to-many)
CREATE TABLE IF NOT EXISTS public.paracosm_world_clusters (
  world_id UUID NOT NULL REFERENCES paracosm_worlds(id) ON DELETE CASCADE,
  cluster_id UUID NOT NULL REFERENCES paracosm_clusters(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, cluster_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paracosm_elements_user_time ON public.paracosm_elements(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_paracosm_elements_memory ON public.paracosm_elements(memory_id);
CREATE INDEX IF NOT EXISTS idx_paracosm_elements_category ON public.paracosm_elements(user_id, category);
CREATE INDEX IF NOT EXISTS idx_paracosm_clusters_user ON public.paracosm_clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_paracosm_worlds_user ON public.paracosm_worlds(user_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_paracosm_elements_embedding ON public.paracosm_elements 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for arrays
CREATE INDEX IF NOT EXISTS idx_paracosm_clusters_themes_gin ON public.paracosm_clusters USING GIN(themes);
CREATE INDEX IF NOT EXISTS idx_paracosm_worlds_data_gin ON public.paracosm_worlds USING GIN(data);

-- RLS
ALTER TABLE public.paracosm_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paracosm_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paracosm_cluster_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paracosm_worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paracosm_world_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own paracosm elements"
  ON public.paracosm_elements
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paracosm elements"
  ON public.paracosm_elements
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paracosm elements"
  ON public.paracosm_elements
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own paracosm elements"
  ON public.paracosm_elements
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own paracosm clusters"
  ON public.paracosm_clusters
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paracosm clusters"
  ON public.paracosm_clusters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paracosm clusters"
  ON public.paracosm_clusters
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own paracosm clusters"
  ON public.paracosm_clusters
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own paracosm worlds"
  ON public.paracosm_worlds
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paracosm worlds"
  ON public.paracosm_worlds
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paracosm worlds"
  ON public.paracosm_worlds
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own paracosm worlds"
  ON public.paracosm_worlds
  FOR DELETE
  USING (auth.uid() = user_id);


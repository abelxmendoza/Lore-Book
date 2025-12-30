-- Inner Mythology Engine V1
-- Identifies and structures mythological elements, archetypes, motifs, and narrative patterns

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Myth Elements Table
CREATE TABLE IF NOT EXISTS public.myth_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'hero',
    'villain',
    'guide',
    'shadow',
    'monster',
    'guardian',
    'temptation',
    'obstacle',
    'quest',
    'prophecy',
    'symbol',
    'inner_realm'
  )),
  text TEXT NOT NULL,
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  intensity NUMERIC CHECK (intensity >= 0 AND intensity <= 1),
  symbolic_weight NUMERIC CHECK (symbolic_weight >= 0 AND symbolic_weight <= 1),
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Myth Motifs Table
CREATE TABLE IF NOT EXISTS public.myth_motifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motif_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Myth Motif Elements (many-to-many)
CREATE TABLE IF NOT EXISTS public.myth_motif_elements (
  motif_id UUID NOT NULL REFERENCES myth_motifs(id) ON DELETE CASCADE,
  element_id UUID NOT NULL REFERENCES myth_elements(id) ON DELETE CASCADE,
  PRIMARY KEY (motif_id, element_id)
);

-- Inner Myths Table
CREATE TABLE IF NOT EXISTS public.inner_myths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  themes TEXT[] DEFAULT '{}',
  summary TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inner Myth Motifs (many-to-many)
CREATE TABLE IF NOT EXISTS public.inner_myth_motifs (
  myth_id UUID NOT NULL REFERENCES inner_myths(id) ON DELETE CASCADE,
  motif_id UUID NOT NULL REFERENCES myth_motifs(id) ON DELETE CASCADE,
  PRIMARY KEY (myth_id, motif_id)
);

-- Myth Archetypes Table (for tracking archetype mappings)
CREATE TABLE IF NOT EXISTS public.myth_archetypes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  myth_id UUID NOT NULL REFERENCES inner_myths(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL,
  evidence TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_myth_elements_user_time ON public.myth_elements(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_myth_elements_memory ON public.myth_elements(memory_id);
CREATE INDEX IF NOT EXISTS idx_myth_elements_category ON public.myth_elements(user_id, category);
CREATE INDEX IF NOT EXISTS idx_myth_motifs_user ON public.myth_motifs(user_id);
CREATE INDEX IF NOT EXISTS idx_inner_myths_user ON public.inner_myths(user_id);
CREATE INDEX IF NOT EXISTS idx_myth_archetypes_myth ON public.myth_archetypes(myth_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_myth_elements_embedding ON public.myth_elements 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for arrays
CREATE INDEX IF NOT EXISTS idx_inner_myths_themes_gin ON public.inner_myths USING GIN(themes);
CREATE INDEX IF NOT EXISTS idx_inner_myths_data_gin ON public.inner_myths USING GIN(data);
CREATE INDEX IF NOT EXISTS idx_myth_archetypes_evidence_gin ON public.myth_archetypes USING GIN(evidence);

-- RLS
ALTER TABLE public.myth_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myth_motifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myth_motif_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inner_myths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inner_myth_motifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myth_archetypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own myth elements"
  ON public.myth_elements
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own myth elements"
  ON public.myth_elements
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own myth elements"
  ON public.myth_elements
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own myth elements"
  ON public.myth_elements
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own myth motifs"
  ON public.myth_motifs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own myth motifs"
  ON public.myth_motifs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own inner myths"
  ON public.inner_myths
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inner myths"
  ON public.inner_myths
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inner myths"
  ON public.inner_myths
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own inner myths"
  ON public.inner_myths
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own myth archetypes"
  ON public.myth_archetypes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own myth archetypes"
  ON public.myth_archetypes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- Social Projection Engine V1
-- Identifies hypothetical people, imagined groups, influencer/celebrity references, and mental simulations

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Social Projections Table
CREATE TABLE IF NOT EXISTS public.social_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  name TEXT,
  projection_type TEXT NOT NULL CHECK (projection_type IN (
    'hypothetical_person',
    'anticipated_connection',
    'influencer',
    'public_figure',
    'archetype',
    'imagined_group'
  )),
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT CHECK (source IN ('thought', 'memory', 'prediction')),
  tags TEXT[] DEFAULT '{}',
  score NUMERIC CHECK (score >= 0 AND score <= 1),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projection Links Table
CREATE TABLE IF NOT EXISTS public.projection_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projection_id UUID NOT NULL REFERENCES social_projections(id) ON DELETE CASCADE,
  related_to TEXT, -- Can reference entity IDs or names
  link_type TEXT NOT NULL CHECK (link_type IN (
    'friend_of',
    'associated_with',
    'archetype_match',
    'influenced_by'
  )),
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_projections_user_time ON public.social_projections(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_projections_memory ON public.social_projections(memory_id);
CREATE INDEX IF NOT EXISTS idx_social_projections_type ON public.social_projections(user_id, projection_type);
CREATE INDEX IF NOT EXISTS idx_social_projections_source ON public.social_projections(user_id, source);
CREATE INDEX IF NOT EXISTS idx_projection_links_projection ON public.projection_links(projection_id);
CREATE INDEX IF NOT EXISTS idx_projection_links_user ON public.projection_links(user_id);
CREATE INDEX IF NOT EXISTS idx_projection_links_related ON public.projection_links(related_to);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_social_projections_embedding ON public.social_projections 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_social_projections_tags_gin ON public.social_projections USING GIN(tags);

-- RLS
ALTER TABLE public.social_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own social projections"
  ON public.social_projections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own social projections"
  ON public.social_projections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own social projections"
  ON public.social_projections
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own social projections"
  ON public.social_projections
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own projection links"
  ON public.projection_links
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projection links"
  ON public.projection_links
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projection links"
  ON public.projection_links
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projection links"
  ON public.projection_links
  FOR DELETE
  USING (auth.uid() = user_id);


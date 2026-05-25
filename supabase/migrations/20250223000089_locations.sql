-- Location Resolution Engine V1
-- Tracks locations across journal entries with semantic matching

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Locations Table
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  type TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  embedding VECTOR(1536),
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, normalized_name)
);

-- Location Mentions Table
CREATE TABLE IF NOT EXISTS public.location_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  extracted_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_locations_user ON public.locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_type ON public.locations(user_id, type);
CREATE INDEX IF NOT EXISTS idx_locations_normalized ON public.locations(user_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_location_mentions_memory ON public.location_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_location_mentions_location ON public.location_mentions(location_id);
CREATE INDEX IF NOT EXISTS idx_location_mentions_user ON public.location_mentions(user_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_locations_embedding ON public.locations 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own locations"
  ON public.locations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own locations"
  ON public.locations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locations"
  ON public.locations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own locations"
  ON public.locations
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own location mentions"
  ON public.location_mentions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own location mentions"
  ON public.location_mentions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own location mentions"
  ON public.location_mentions
  FOR DELETE
  USING (auth.uid() = user_id);


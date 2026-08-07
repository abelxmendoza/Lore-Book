-- Location Resolution Engine V1
-- Tracks locations across journal entries with semantic matching

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

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


-- Deferred FKs from earlier migrations that referenced this table before it existed.
DO $$
BEGIN
  IF to_regclass('public.photo_location_links') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'photo_location_links_location_id_fkey'
     ) THEN
    ALTER TABLE public.photo_location_links
      ADD CONSTRAINT photo_location_links_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Deferred FK from earlier migration (fresh preview branches).
DO $$
BEGIN
  IF to_regclass('public.workout_events') IS NOT NULL
     AND to_regclass('public.locations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'workout_events_location_id_fkey'
     ) THEN
    ALTER TABLE public.workout_events
      ADD CONSTRAINT workout_events_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Deferred FK from earlier migration (fresh preview branches).
DO $$
BEGIN
  IF to_regclass('public.interest_mentions') IS NOT NULL
     AND to_regclass('public.locations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'interest_mentions_mentioned_at_location_fkey'
     ) THEN
    ALTER TABLE public.interest_mentions
      ADD CONSTRAINT interest_mentions_mentioned_at_location_fkey
      FOREIGN KEY (mentioned_at_location) REFERENCES public.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

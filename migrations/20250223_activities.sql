-- Activity Resolution Engine V1
-- Tracks activities across journal entries with semantic matching

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Activities Table
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT,
  intensity INTEGER CHECK (intensity >= 1 AND intensity <= 10),
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, normalized_name)
);

-- Activity Mentions Table
CREATE TABLE IF NOT EXISTS public.activity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  extracted_name TEXT,
  category TEXT,
  intensity INTEGER CHECK (intensity >= 1 AND intensity <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_user ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_category ON public.activities(user_id, category);
CREATE INDEX IF NOT EXISTS idx_activities_normalized ON public.activities(user_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_activity_mentions_memory ON public.activity_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_activity_mentions_activity ON public.activity_mentions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_mentions_user ON public.activity_mentions(user_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_activities_embedding ON public.activities 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities"
  ON public.activities
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities"
  ON public.activities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activities"
  ON public.activities
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own activities"
  ON public.activities
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own activity mentions"
  ON public.activity_mentions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity mentions"
  ON public.activity_mentions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity mentions"
  ON public.activity_mentions
  FOR DELETE
  USING (auth.uid() = user_id);


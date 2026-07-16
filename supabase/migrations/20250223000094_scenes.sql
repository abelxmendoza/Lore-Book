-- Scene Generator Engine V1
-- Extracts and structures narrative scenes from journal entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Scenes Table
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  title TEXT,
  type TEXT CHECK (type IN ('social', 'fight', 'nightlife', 'work', 'training', 'family', 'romantic', 'general')),
  setting TEXT,
  time_context TEXT,
  mood TEXT,
  emotional_arc JSONB DEFAULT '[]',
  beats JSONB DEFAULT '[]',
  characters JSONB DEFAULT '[]',
  interactions JSONB DEFAULT '[]',
  outcome TEXT,
  summary TEXT,
  embedding VECTOR(1536),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scene Characters Table (many-to-many)
CREATE TABLE IF NOT EXISTS public.scene_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('protagonist', 'antagonist', 'ally', 'bystander', 'love_interest', 'mentor', 'other')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scenes_user_time ON public.scenes(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scenes_memory ON public.scenes(memory_id);
CREATE INDEX IF NOT EXISTS idx_scenes_type ON public.scenes(user_id, type);
CREATE INDEX IF NOT EXISTS idx_scene_characters_scene ON public.scene_characters(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_characters_name ON public.scene_characters(name);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_scenes_embedding ON public.scenes 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for JSONB arrays
CREATE INDEX IF NOT EXISTS idx_scenes_emotional_arc_gin ON public.scenes USING GIN(emotional_arc);
CREATE INDEX IF NOT EXISTS idx_scenes_beats_gin ON public.scenes USING GIN(beats);
CREATE INDEX IF NOT EXISTS idx_scenes_characters_gin ON public.scenes USING GIN(characters);
CREATE INDEX IF NOT EXISTS idx_scenes_interactions_gin ON public.scenes USING GIN(interactions);

-- RLS
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scenes"
  ON public.scenes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scenes"
  ON public.scenes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scenes"
  ON public.scenes
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scenes"
  ON public.scenes
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own scene characters"
  ON public.scene_characters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes
      WHERE scenes.id = scene_characters.scene_id
      AND scenes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own scene characters"
  ON public.scene_characters
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scenes
      WHERE scenes.id = scene_characters.scene_id
      AND scenes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own scene characters"
  ON public.scene_characters
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes
      WHERE scenes.id = scene_characters.scene_id
      AND scenes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own scene characters"
  ON public.scene_characters
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes
      WHERE scenes.id = scene_characters.scene_id
      AND scenes.user_id = auth.uid()
    )
  );


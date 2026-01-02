-- Conflict Detection Engine V1
-- Detects and structures conflicts from journal entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Conflicts Table
CREATE TABLE IF NOT EXISTS public.conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('physical', 'verbal', 'social', 'emotional', 'internal', 'general')),
  setting TEXT,
  trigger TEXT,
  escalation TEXT,
  participants JSONB DEFAULT '[]',
  intensity NUMERIC CHECK (intensity >= 0 AND intensity <= 1),
  conflict_beats JSONB DEFAULT '[]',
  emotional_impact JSONB DEFAULT '{}',
  outcome TEXT,
  summary TEXT,
  embedding VECTOR(1536),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conflicts_user_time ON public.conflicts(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conflicts_memory ON public.conflicts(memory_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_type ON public.conflicts(user_id, type);
CREATE INDEX IF NOT EXISTS idx_conflicts_intensity ON public.conflicts(user_id, intensity DESC);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_conflicts_embedding ON public.conflicts 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for JSONB arrays
CREATE INDEX IF NOT EXISTS idx_conflicts_participants_gin ON public.conflicts USING GIN(participants);
CREATE INDEX IF NOT EXISTS idx_conflicts_beats_gin ON public.conflicts USING GIN(conflict_beats);
CREATE INDEX IF NOT EXISTS idx_conflicts_emotional_impact_gin ON public.conflicts USING GIN(emotional_impact);

-- RLS
ALTER TABLE public.conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conflicts"
  ON public.conflicts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conflicts"
  ON public.conflicts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conflicts"
  ON public.conflicts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conflicts"
  ON public.conflicts
  FOR DELETE
  USING (auth.uid() = user_id);


-- Toxicity & Red Flag Engine V1
-- Detects toxic dynamics, red flags, and dangerous patterns

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Toxicity Events Table
CREATE TABLE IF NOT EXISTS public.toxicity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  entity_type TEXT CHECK (entity_type IN ('person', 'place', 'situation', 'general')),
  entity_name TEXT,
  category TEXT CHECK (category IN ('jealousy', 'manipulation', 'aggression', 'chaos', 'betrayal', 'disrespect', 'hostility', 'instability', 'sabotage', 'dominance', 'danger', 'general')),
  red_flags JSONB DEFAULT '[]',
  severity NUMERIC CHECK (severity >= 0 AND severity <= 1),
  pattern TEXT,
  prediction TEXT,
  summary TEXT,
  embedding VECTOR(1536),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_toxicity_user_time ON public.toxicity_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_toxicity_memory ON public.toxicity_events(memory_id);
CREATE INDEX IF NOT EXISTS idx_toxicity_entity ON public.toxicity_events(user_id, entity_type, entity_name);
CREATE INDEX IF NOT EXISTS idx_toxicity_category ON public.toxicity_events(user_id, category);
CREATE INDEX IF NOT EXISTS idx_toxicity_severity ON public.toxicity_events(user_id, severity DESC);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_toxicity_embedding ON public.toxicity_events 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN index for red flags array
CREATE INDEX IF NOT EXISTS idx_toxicity_red_flags_gin ON public.toxicity_events USING GIN(red_flags);

-- RLS
ALTER TABLE public.toxicity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own toxicity events"
  ON public.toxicity_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own toxicity events"
  ON public.toxicity_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own toxicity events"
  ON public.toxicity_events
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own toxicity events"
  ON public.toxicity_events
  FOR DELETE
  USING (auth.uid() = user_id);


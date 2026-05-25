-- Behavior Loop Resolution Engine V1
-- Tracks behaviors and detects recurring behavior loops

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Behavior Events Table
CREATE TABLE IF NOT EXISTS public.behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  behavior TEXT NOT NULL,
  subtype TEXT,
  intensity FLOAT CHECK (intensity >= 0 AND intensity <= 1),
  polarity TEXT CHECK (polarity IN ('positive', 'negative', 'neutral')),
  embedding VECTOR(1536),
  timestamp TIMESTAMPTZ NOT NULL,
  evidence TEXT,
  confidence FLOAT DEFAULT 0.9 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Behavior Mentions Table
CREATE TABLE IF NOT EXISTS public.behavior_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behavior_id UUID NOT NULL REFERENCES behavior_events(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Behavior Loops Table
CREATE TABLE IF NOT EXISTS public.behavior_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loop_name TEXT NOT NULL,
  category TEXT CHECK (category IN ('emotional', 'social', 'habit', 'avoidance', 'conflict', 'behavior')),
  behaviors TEXT[] DEFAULT '{}',
  triggers TEXT[] DEFAULT '{}',
  consequences TEXT[] DEFAULT '{}',
  loop_length INT DEFAULT 1,
  occurrences INT DEFAULT 1,
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_behavior_events_user_time ON public.behavior_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_events_behavior ON public.behavior_events(user_id, behavior);
CREATE INDEX IF NOT EXISTS idx_behavior_mentions_memory ON public.behavior_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_behavior_mentions_behavior ON public.behavior_mentions(behavior_id);
CREATE INDEX IF NOT EXISTS idx_behavior_loops_user ON public.behavior_loops(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_loops_category ON public.behavior_loops(user_id, category);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_behavior_events_embedding ON public.behavior_events 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for arrays
CREATE INDEX IF NOT EXISTS idx_behavior_loops_behaviors_gin ON public.behavior_loops USING GIN(behaviors);
CREATE INDEX IF NOT EXISTS idx_behavior_loops_triggers_gin ON public.behavior_loops USING GIN(triggers);
CREATE INDEX IF NOT EXISTS idx_behavior_loops_consequences_gin ON public.behavior_loops USING GIN(consequences);

-- RLS
ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own behavior events"
  ON public.behavior_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavior events"
  ON public.behavior_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own behavior events"
  ON public.behavior_events
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own behavior events"
  ON public.behavior_events
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own behavior mentions"
  ON public.behavior_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.behavior_events
      WHERE behavior_events.id = behavior_mentions.behavior_id
      AND behavior_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own behavior mentions"
  ON public.behavior_mentions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.behavior_events
      WHERE behavior_events.id = behavior_mentions.behavior_id
      AND behavior_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own behavior loops"
  ON public.behavior_loops
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavior loops"
  ON public.behavior_loops
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own behavior loops"
  ON public.behavior_loops
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own behavior loops"
  ON public.behavior_loops
  FOR DELETE
  USING (auth.uid() = user_id);



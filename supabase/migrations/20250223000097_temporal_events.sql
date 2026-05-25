-- Temporal Event Resolution Engine V1
-- Assembles temporal signals (people, locations, activities) into unified events

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Resolved Events Table (unified WHO + WHERE + WHAT + WHEN)
CREATE TABLE IF NOT EXISTS public.resolved_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core fields
  title TEXT NOT NULL,
  summary TEXT,
  type TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  confidence FLOAT DEFAULT 0.9 CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Embedding for event-level semantic search
  embedding VECTOR(1536),
  
  -- Normalized signals (UUID arrays)
  people UUID[] DEFAULT '{}',
  locations UUID[] DEFAULT '{}',
  activities UUID[] DEFAULT '{}',
  
  -- Metadata / raw context
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link event to memory entries that contributed to it
CREATE TABLE IF NOT EXISTS public.event_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES resolved_events(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  signal JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_resolved_events_user ON public.resolved_events(user_id);
CREATE INDEX IF NOT EXISTS idx_resolved_events_start_time ON public.resolved_events(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_resolved_events_type ON public.resolved_events(user_id, type);
CREATE INDEX IF NOT EXISTS idx_event_mentions_memory ON public.event_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_event_mentions_event ON public.event_mentions(event_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_resolved_events_embedding ON public.resolved_events 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN indexes for array searches
CREATE INDEX IF NOT EXISTS idx_resolved_events_people_gin ON public.resolved_events USING GIN(people);
CREATE INDEX IF NOT EXISTS idx_resolved_events_locations_gin ON public.resolved_events USING GIN(locations);
CREATE INDEX IF NOT EXISTS idx_resolved_events_activities_gin ON public.resolved_events USING GIN(activities);

-- RLS
ALTER TABLE public.resolved_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resolved events"
  ON public.resolved_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resolved events"
  ON public.resolved_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resolved events"
  ON public.resolved_events
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resolved events"
  ON public.resolved_events
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own event mentions"
  ON public.event_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.resolved_events
      WHERE resolved_events.id = event_mentions.event_id
      AND resolved_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own event mentions"
  ON public.event_mentions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.resolved_events
      WHERE resolved_events.id = event_mentions.event_id
      AND resolved_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own event mentions"
  ON public.event_mentions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.resolved_events
      WHERE resolved_events.id = event_mentions.event_id
      AND resolved_events.user_id = auth.uid()
    )
  );


-- Event Resolution Engine V1
-- Tracks events across journal entries with time, location, and semantic matching

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Events Table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_title TEXT NOT NULL,
  summary TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event Mentions Table
CREATE TABLE IF NOT EXISTS public.event_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  timestamp TIMESTAMPTZ,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_user ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON public.events(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_event_mentions_memory ON public.event_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_event_mentions_event ON public.event_mentions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_mentions_user ON public.event_mentions(user_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_events_embedding ON public.events 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON public.events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON public.events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON public.events
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON public.events
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own event mentions"
  ON public.event_mentions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event mentions"
  ON public.event_mentions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own event mentions"
  ON public.event_mentions
  FOR DELETE
  USING (auth.uid() = user_id);


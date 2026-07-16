-- Emotion Resolution Engine V1
-- Tracks emotional events with triggers, intensity, and temporal clustering

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Emotion Events Table
CREATE TABLE IF NOT EXISTS public.emotion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  emotion TEXT NOT NULL,
  subtype TEXT,
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  polarity TEXT NOT NULL CHECK (polarity IN ('positive', 'negative', 'neutral')),
  triggers TEXT[] DEFAULT '{}',
  embedding VECTOR(1536),
  confidence FLOAT DEFAULT 0.9 CHECK (confidence >= 0 AND confidence <= 1),
  
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emotion Mentions Table
CREATE TABLE IF NOT EXISTS public.emotion_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emotion_id UUID NOT NULL REFERENCES emotion_events(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emotion_events_user ON public.emotion_events(user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_events_emotion ON public.emotion_events(user_id, emotion);
CREATE INDEX IF NOT EXISTS idx_emotion_events_polarity ON public.emotion_events(user_id, polarity);
CREATE INDEX IF NOT EXISTS idx_emotion_events_start_time ON public.emotion_events(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_emotion_mentions_memory ON public.emotion_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_emotion_mentions_emotion ON public.emotion_mentions(emotion_id);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_emotion_events_embedding ON public.emotion_events 
  USING hnsw (embedding vector_cosine_ops) 
  WHERE embedding IS NOT NULL;

-- GIN index for triggers array
CREATE INDEX IF NOT EXISTS idx_emotion_events_triggers_gin ON public.emotion_events USING GIN(triggers);

-- RLS
ALTER TABLE public.emotion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own emotion events"
  ON public.emotion_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emotion events"
  ON public.emotion_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emotion events"
  ON public.emotion_events
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own emotion events"
  ON public.emotion_events
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own emotion mentions"
  ON public.emotion_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.emotion_events
      WHERE emotion_events.id = emotion_mentions.emotion_id
      AND emotion_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own emotion mentions"
  ON public.emotion_mentions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.emotion_events
      WHERE emotion_events.id = emotion_mentions.emotion_id
      AND emotion_events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own emotion mentions"
  ON public.emotion_mentions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.emotion_events
      WHERE emotion_events.id = emotion_mentions.emotion_id
      AND emotion_events.user_id = auth.uid()
    )
  );


-- Entity Resolution Engine V1
-- Tracks people, places, organizations, events, and things across journal entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Entity Master Table
CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('person', 'place', 'org', 'event', 'thing')),
  canonical_name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entity Links (to journal entries)
CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON public.entities(user_id, type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON public.entities(user_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_memory ON public.entity_mentions(memory_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON public.entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_user ON public.entity_mentions(user_id);

-- GIN index for aliases array search
CREATE INDEX IF NOT EXISTS idx_entities_aliases_gin ON public.entities USING GIN(aliases);

-- RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entities"
  ON public.entities
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entities"
  ON public.entities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entities"
  ON public.entities
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entities"
  ON public.entities
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own entity mentions"
  ON public.entity_mentions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entity mentions"
  ON public.entity_mentions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own entity mentions"
  ON public.entity_mentions
  FOR DELETE
  USING (auth.uid() = user_id);


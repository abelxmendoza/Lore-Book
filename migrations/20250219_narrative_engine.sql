-- Narrative Engine Schema
-- Stores coherent narratives and stories built from memories

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Narratives Table
-- Stores all generated narratives
CREATE TABLE IF NOT EXISTS public.narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'chronological', 'thematic', 'character_focused', 
    'emotional_arc', 'event_sequence', 'reflection', 'growth_story'
  )),
  style TEXT NOT NULL CHECK (style IN (
    'descriptive', 'reflective', 'analytical', 'poetic', 'journalistic'
  )),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  transitions JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_ids UUID[] NOT NULL DEFAULT '{}',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  themes TEXT[] DEFAULT '{}',
  characters TEXT[] DEFAULT '{}',
  emotional_arc JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete', 'archived')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_narratives_user_status ON public.narratives(user_id, status);
CREATE INDEX IF NOT EXISTS idx_narratives_user_type ON public.narratives(user_id, type);
CREATE INDEX IF NOT EXISTS idx_narratives_start_date ON public.narratives(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_narratives_themes ON public.narratives USING GIN(themes);
CREATE INDEX IF NOT EXISTS idx_narratives_characters ON public.narratives USING GIN(characters);
CREATE INDEX IF NOT EXISTS idx_narratives_entry_ids ON public.narratives USING GIN(entry_ids);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.narratives ENABLE ROW LEVEL SECURITY;

-- Users can only see their own narratives
CREATE POLICY "Users can view own narratives"
  ON public.narratives
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own narratives (via service)
CREATE POLICY "Users can insert own narratives"
  ON public.narratives
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own narratives
CREATE POLICY "Users can update own narratives"
  ON public.narratives
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own narratives
CREATE POLICY "Users can delete own narratives"
  ON public.narratives
  FOR DELETE
  USING (auth.uid() = user_id);


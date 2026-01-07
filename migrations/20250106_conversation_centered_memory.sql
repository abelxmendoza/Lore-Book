-- =====================================================
-- CONVERSATION-CENTERED MEMORY ARCHITECTURE
-- Purpose: Treat chat threads as the ONLY primary input.
-- All structure (events, decisions, insights, truth)
-- is DERIVED from messy conversational data.
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- =====================================================
-- PRIMARY DATA MODEL (USER-FACING)
-- =====================================================

-- ConversationThread: Primary user-facing structure
-- Note: We'll use conversation_sessions as the base, but add scope field
ALTER TABLE IF EXISTS public.conversation_sessions 
  ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('PRIVATE', 'SHARED', 'PUBLIC')) DEFAULT 'PRIVATE';

-- Message: Already exists as conversation_messages
-- We'll use it as-is, but ensure it has raw_text (content field)

-- =====================================================
-- INTERNAL ATOMIC UNITS (HIDDEN)
-- =====================================================

-- Utterances: Normalized text units from messages
CREATE TABLE IF NOT EXISTS public.utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  normalized_text TEXT NOT NULL,              -- cleaned, corrected
  original_text TEXT NOT NULL,                -- preserve original
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ExtractedUnits: Semantic units extracted from utterances
CREATE TABLE IF NOT EXISTS public.extracted_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utterance_id UUID NOT NULL REFERENCES public.utterances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'EXPERIENCE',     -- something that happened
    'FEELING',        -- emotional reaction
    'THOUGHT',        -- cognition / reflection
    'PERCEPTION',     -- belief / assumption
    'CLAIM',          -- factual assertion
    'DECISION',       -- choice / intent
    'CORRECTION'      -- revision / retraction
  )),
  content TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  temporal_context JSONB DEFAULT '{}'::jsonb,
  entity_ids UUID[] DEFAULT '{}',            -- linked entities
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- EVENT ASSEMBLY (DERIVED VIEW)
-- =====================================================

-- Events: Assembled from multiple extracted units
-- Note: resolved_events table already exists, we'll link to it
CREATE TABLE IF NOT EXISTS public.event_unit_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.extracted_units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, unit_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Utterances indexes
CREATE INDEX IF NOT EXISTS idx_utterances_message ON public.utterances(message_id);
CREATE INDEX IF NOT EXISTS idx_utterances_user ON public.utterances(user_id);
CREATE INDEX IF NOT EXISTS idx_utterances_created ON public.utterances(created_at DESC);

-- ExtractedUnits indexes
CREATE INDEX IF NOT EXISTS idx_extracted_units_utterance ON public.extracted_units(utterance_id);
CREATE INDEX IF NOT EXISTS idx_extracted_units_user ON public.extracted_units(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_units_type ON public.extracted_units(type);
CREATE INDEX IF NOT EXISTS idx_extracted_units_confidence ON public.extracted_units(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_units_created ON public.extracted_units(created_at DESC);

-- GIN index for entity_ids array
CREATE INDEX IF NOT EXISTS idx_extracted_units_entities_gin ON public.extracted_units USING GIN(entity_ids);

-- Event unit links
CREATE INDEX IF NOT EXISTS idx_event_unit_links_event ON public.event_unit_links(event_id);
CREATE INDEX IF NOT EXISTS idx_event_unit_links_unit ON public.event_unit_links(unit_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_unit_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for utterances
CREATE POLICY "Users can view their own utterances"
  ON public.utterances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own utterances"
  ON public.utterances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for extracted_units
CREATE POLICY "Users can view their own extracted units"
  ON public.extracted_units FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own extracted units"
  ON public.extracted_units FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for event_unit_links
CREATE POLICY "Users can view their own event unit links"
  ON public.event_unit_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.extracted_units eu
      WHERE eu.id = event_unit_links.unit_id
      AND eu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own event unit links"
  ON public.event_unit_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.extracted_units eu
      WHERE eu.id = event_unit_links.unit_id
      AND eu.user_id = auth.uid()
    )
  );


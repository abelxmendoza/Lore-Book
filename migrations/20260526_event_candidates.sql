-- Event Candidates — Cross-Session Recurring Scene Detection
-- Tracks autobiographical patterns that emerge from repeated entity + location + activity combinations
-- across multiple threads and sessions.
--
-- Design principles:
--   • One row per recurring scene pattern (not per event occurrence)
--   • Confidence accumulates gradually — never surfaces on first occurrence alone
--   • Provenance always preserved via source_event_ids (links back to resolved_events)
--   • User-owned with full RLS — same isolation contract as all other memory tables

CREATE TABLE IF NOT EXISTS public.event_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  canonical_title TEXT NOT NULL,

  -- Entity composition (UUID references to entities table)
  dominant_entities UUID[] NOT NULL DEFAULT '{}',
  -- Denormalized names for display without joins (updated on each reinforcement)
  dominant_entity_names TEXT[] NOT NULL DEFAULT '{}',

  -- Activity and context signals (free-text words extracted from event summaries)
  recurring_activities TEXT[] NOT NULL DEFAULT '{}',

  -- Emotional register of the pattern
  emotional_tone TEXT,

  -- Temporal tracking
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,

  -- Accumulation state
  occurrence_count INT NOT NULL DEFAULT 1,
  -- 0.0 = speculative / 1.0 = stable autobiographical scene
  -- 1 occurrence → ~0.25, 2 → ~0.50, 3 → ~0.72, 4+ → approaches 0.92
  continuity_strength FLOAT NOT NULL DEFAULT 0.25
    CHECK (continuity_strength >= 0 AND continuity_strength <= 1),

  -- Provenance chain
  source_thread_ids UUID[] NOT NULL DEFAULT '{}',
  source_event_ids UUID[] NOT NULL DEFAULT '{}',

  -- Surfacing readiness (set to true at continuity_strength >= 0.60)
  timeline_candidate BOOLEAN NOT NULL DEFAULT false,

  -- Overall pattern confidence (accounts for entity overlap quality)
  confidence FLOAT NOT NULL DEFAULT 0.40
    CHECK (confidence >= 0 AND confidence <= 1),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_candidates_user
  ON public.event_candidates(user_id);

CREATE INDEX IF NOT EXISTS idx_event_candidates_user_strength
  ON public.event_candidates(user_id, continuity_strength DESC);

CREATE INDEX IF NOT EXISTS idx_event_candidates_last_seen
  ON public.event_candidates(user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_candidates_entities
  ON public.event_candidates USING GIN(dominant_entities);

CREATE INDEX IF NOT EXISTS idx_event_candidates_source_events
  ON public.event_candidates USING GIN(source_event_ids);

-- RLS
ALTER TABLE public.event_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event candidates"
  ON public.event_candidates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own event candidates"
  ON public.event_candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own event candidates"
  ON public.event_candidates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own event candidates"
  ON public.event_candidates FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_event_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_candidates_updated_at
  BEFORE UPDATE ON public.event_candidates
  FOR EACH ROW EXECUTE FUNCTION update_event_candidates_updated_at();

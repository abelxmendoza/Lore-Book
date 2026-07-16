-- =====================================================
-- EVENT CAUSAL RELATIONSHIPS
-- Purpose: Track causal, enabling, and triggering relationships between events
-- Example: "abuelo got West Nile virus" → "tia Lourdes at post-acute center"
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.event_causal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cause_event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  effect_event_id UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  causal_type TEXT NOT NULL CHECK (causal_type IN (
    'causes',           -- Event A directly causes Event B
    'enables',         -- Event A makes Event B possible
    'prevents',        -- Event A prevents Event B
    'triggers',        -- Event A triggers Event B
    'follows_from',    -- Event B follows from Event A
    'reaction_to',     -- Event B is a reaction to Event A
    'mitigates',       -- Event A reduces impact of Event B
    'amplifies',       -- Event A increases impact of Event B
    'parallel_to',     -- Events happen simultaneously/related
    'replaces'         -- Event B replaces Event A
  )),
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  evidence_source_ids UUID[], -- IDs of messages/journal entries that support this
  time_lag_days INT, -- How many days between cause and effect (if known)
  causal_strength FLOAT CHECK (causal_strength >= 0 AND causal_strength <= 1), -- How strong the causal link is
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cause_event_id, effect_event_id, causal_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_causal_links_user ON public.event_causal_links(user_id);
CREATE INDEX IF NOT EXISTS idx_event_causal_links_cause ON public.event_causal_links(cause_event_id);
CREATE INDEX IF NOT EXISTS idx_event_causal_links_effect ON public.event_causal_links(effect_event_id);
CREATE INDEX IF NOT EXISTS idx_event_causal_links_type ON public.event_causal_links(causal_type);
CREATE INDEX IF NOT EXISTS idx_event_causal_links_user_cause ON public.event_causal_links(user_id, cause_event_id);
CREATE INDEX IF NOT EXISTS idx_event_causal_links_user_effect ON public.event_causal_links(user_id, effect_event_id);

-- RLS
ALTER TABLE public.event_causal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own causal links"
  ON public.event_causal_links FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own causal links"
  ON public.event_causal_links FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own causal links"
  ON public.event_causal_links FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own causal links"
  ON public.event_causal_links FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.event_causal_links IS 'Tracks causal, enabling, and triggering relationships between events';
COMMENT ON COLUMN public.event_causal_links.causal_type IS 'Type of causal relationship: causes, enables, prevents, triggers, etc.';
COMMENT ON COLUMN public.event_causal_links.causal_strength IS 'How strong the causal link is (0.0-1.0)';
COMMENT ON COLUMN public.event_causal_links.time_lag_days IS 'Days between cause and effect events';

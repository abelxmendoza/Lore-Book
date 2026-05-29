-- event_candidates: recurring scene / event pattern detection
--
-- Each row represents a candidate "recurring scene" — a pattern of events
-- that share the same dominant entities (people + locations) and have been
-- observed at least once. Reinforced on each new matching resolved_event.
--
-- Referenced by:
--   apps/server/src/services/eventCandidates/eventCandidateService.ts
--   apps/server/src/services/chat/systemPromptBuilder.ts (return-to-thread injection)
--
-- Required for scene candidates in character cards and autobiographical continuity.

CREATE TABLE IF NOT EXISTS public.event_candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human-readable label built from entity names + activity words
  canonical_title       TEXT NOT NULL,

  -- Entity IDs (from entities table) that recur across this pattern
  dominant_entities     TEXT[]  NOT NULL DEFAULT '{}',
  -- Pre-resolved display names — cached to avoid N queries at prompt-build time
  dominant_entity_names TEXT[]  NOT NULL DEFAULT '{}',

  -- Activity keywords extracted from titles/summaries ("gym", "dinner", "coding")
  recurring_activities  TEXT[]  NOT NULL DEFAULT '{}',

  -- Source resolved_event IDs that contributed to this candidate
  source_event_ids      TEXT[]  NOT NULL DEFAULT '{}',
  -- Source thread IDs for provenance — enables "you last talked about this in…"
  source_thread_ids     TEXT[]  NOT NULL DEFAULT '{}',

  -- How many times this pattern has been observed
  occurrence_count      INTEGER NOT NULL DEFAULT 1,

  -- Continuity strength [0, 1]:
  --   ≥ 0.50 → visible in character cards
  --   ≥ 0.60 → timeline_candidate = true
  --   ≥ 0.72 → injected into return-to-thread system prompt
  continuity_strength   FLOAT   NOT NULL DEFAULT 0.25,

  -- Whether this candidate is strong enough to surface on the timeline
  timeline_candidate    BOOLEAN NOT NULL DEFAULT false,

  -- Extraction confidence [0, 1]
  confidence            FLOAT   NOT NULL DEFAULT 0.40,

  first_seen_at         TIMESTAMPTZ,
  last_seen_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: all candidates for a user (used in prompt builder)
CREATE INDEX IF NOT EXISTS idx_event_candidates_user
  ON public.event_candidates (user_id);

-- GIN on dominant_entities for the && (overlap) operator used in processResolvedEvent.
-- This is the core performance index — turns O(n·E²) JS loops into O(log n + k) DB queries.
CREATE INDEX IF NOT EXISTS idx_event_candidates_entities
  ON public.event_candidates USING GIN (dominant_entities);

-- Composite for return-to-thread injection: strong candidates for a user, sorted by strength
CREATE INDEX IF NOT EXISTS idx_event_candidates_strength
  ON public.event_candidates (user_id, continuity_strength DESC)
  WHERE timeline_candidate = true;

-- Source event dedup: quickly check if an event_id is already in source_event_ids
CREATE INDEX IF NOT EXISTS idx_event_candidates_source_events
  ON public.event_candidates USING GIN (source_event_ids);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.event_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own event candidates"
  ON public.event_candidates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event candidates"
  ON public.event_candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own event candidates"
  ON public.event_candidates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own event candidates"
  ON public.event_candidates FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass (used by server-side ingestion pipeline)
CREATE POLICY "Service role full access to event candidates"
  ON public.event_candidates
  USING (auth.role() = 'service_role');

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_event_candidates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_candidates_updated_at
  BEFORE UPDATE ON public.event_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_event_candidates_updated_at();

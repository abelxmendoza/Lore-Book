-- ============================================================================
-- RELATIONSHIP INTELLIGENCE SCHEMA
--
-- Two fixes in one migration:
--
-- 1. Missing arc columns — track, dominant_emotion, emotional_arc exist in the
--    TypeScript arcService types but were never added to the SQL schema.
--    Every arc upsert silently drops these values. Fixed here.
--
-- 2. Extended evidence_type constraint — relationship intelligence requires
--    tracing knowledge claims back to romantic interactions, cycles, drift,
--    and the relationship record itself. The check constraint only allows
--    the original 7 source types. Extended to 11.
-- ============================================================================

-- ─── 1. Missing life_arcs columns ────────────────────────────────────────────

ALTER TABLE public.life_arcs
  ADD COLUMN IF NOT EXISTS track TEXT
    CHECK (track IN ('career','relationships','creative','health','inner','mixed','custom')),

  ADD COLUMN IF NOT EXISTS dominant_emotion TEXT,

  ADD COLUMN IF NOT EXISTS emotional_arc TEXT
    CHECK (emotional_arc IN ('building','climax','resolution','grief','recovery','neutral'));

-- Index for relationship-track arc lookups (used by relationship_ended trigger)
CREATE INDEX IF NOT EXISTS idx_life_arcs_track
  ON public.life_arcs (user_id, track)
  WHERE track IS NOT NULL;

-- ─── 2. Extend knowledge_evidence_links.evidence_type ────────────────────────
--
-- The check constraint cannot be altered in place — drop and recreate.
-- No data loss: the constraint is only a guard on INSERT/UPDATE; existing
-- rows are unaffected.

ALTER TABLE public.knowledge_evidence_links
  DROP CONSTRAINT IF EXISTS knowledge_evidence_links_evidence_type_check;

ALTER TABLE public.knowledge_evidence_links
  ADD CONSTRAINT knowledge_evidence_links_evidence_type_check
    CHECK (evidence_type IN (
      -- Original 7 types
      'event_candidate',
      'life_arc',
      'arc_membership',
      'event_interpretation',
      'resolved_event',
      'omega_claim',
      'correction',
      -- Relationship intelligence types (4 new)
      'romantic_interaction',    -- A logged date, call, fight, or meetup
      'romantic_relationship',   -- The relationship record itself (for relationship claims)
      'relationship_cycle',      -- A detected behavioral cycle
      'relationship_drift'       -- A drift direction snapshot
    ));

-- ─── 3. Relationship legacy scaffolding ───────────────────────────────────────
--
-- relationship_arcs view: arcs where track = 'relationships', with their
-- linked romantic_relationship_id from metadata.
-- Used by influence view and biography builder to query relationship arcs efficiently.

CREATE OR REPLACE VIEW public.relationship_arcs AS
  SELECT
    id,
    user_id,
    title,
    arc_type,
    dominant_emotion,
    emotional_arc,
    start_date,
    end_date,
    is_active,
    summary,
    confidence,
    stability_score,
    source,
    tags,
    metadata,
    -- Extract the linked romantic_relationship_id from metadata JSONB
    (metadata->>'romantic_relationship_id')::uuid AS romantic_relationship_id,
    created_at,
    updated_at
  FROM public.life_arcs
  WHERE track = 'relationships';

-- No RLS needed on views — inherits from base table.

-- ─── 4. Cross-relationship pattern storage ────────────────────────────────────
--
-- Stores detected cross-relationship patterns. Used by the crystallization
-- engine's cross_relationship_pattern trigger to avoid recomputing on every chat.
-- Not a permanent truth — rows are refreshed when new relationships end.

CREATE TABLE IF NOT EXISTS public.relationship_patterns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pattern category
  pattern_type    TEXT        NOT NULL
    CHECK (pattern_type IN (
      'cycle_recurrence',      -- Same cycle_type across 3+ relationships
      'flag_theme',            -- Same red/green flag theme across 3+ relationships
      'trajectory',            -- Same affection arc shape across 3+ relationships
      'breakup_pattern',       -- Same breakup_type across 3+ relationships
      'duration_pattern'       -- Relationships cluster in similar duration windows
    )),

  -- Human-readable description of the pattern
  description     TEXT        NOT NULL,

  -- The specific value being repeated (e.g., 'push_pull', 'inconsistent_communication')
  pattern_value   TEXT        NOT NULL,

  -- Number of relationships in which this pattern appeared
  occurrence_count INT        NOT NULL DEFAULT 0,

  -- IDs of the relationships that show this pattern
  relationship_ids UUID[]     NOT NULL DEFAULT '{}',

  -- Confidence in the pattern (0.45 + (count-3)*0.10, max 0.80)
  confidence      FLOAT       NOT NULL DEFAULT 0.45,

  -- Whether this pattern has been crystallized into knowledge
  crystallized_knowledge_id UUID REFERENCES public.crystallized_knowledge(id) ON DELETE SET NULL,

  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_patterns_dedup
  ON public.relationship_patterns (user_id, pattern_type, pattern_value);

CREATE INDEX IF NOT EXISTS idx_relationship_patterns_user
  ON public.relationship_patterns (user_id, confidence DESC);

ALTER TABLE public.relationship_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own relationship patterns"
  ON public.relationship_patterns FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to relationship_patterns"
  ON public.relationship_patterns USING (auth.role() = 'service_role');

-- ============================================================================
-- NARRATIVE CLAIMS SPINE — Phase 1A epistemic layer
--
-- Separates the five epistemic types that must never collapse:
--   fact | event | evidence | interpretation | meaning
--
-- narrative_claim_edges links claims into an explainable graph.
-- source_table + source_id bridge legacy rows (entry_ir, resolved_events, etc.)
-- without duplicating their storage.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.narrative_claims (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  claim_kind      TEXT        NOT NULL
    CHECK (claim_kind IN ('fact', 'event', 'evidence', 'interpretation', 'meaning')),

  statement       TEXT        NOT NULL,
  summary         TEXT,
  machine_key     TEXT,

  confidence      FLOAT       NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.05 AND confidence <= 0.99),

  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'disputed', 'archived')),

  -- Bridge to existing durable tables (optional)
  source_table    TEXT,
  source_id       UUID,

  occurred_at     TIMESTAMPTZ,
  occurred_end    TIMESTAMPTZ,
  significance    FLOAT       CHECK (significance IS NULL OR (significance >= 0 AND significance <= 1)),

  meta            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT narrative_claims_source_pair
    CHECK (
      (source_table IS NULL AND source_id IS NULL)
      OR (source_table IS NOT NULL AND source_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_narrative_claims_source_bridge
  ON public.narrative_claims (user_id, source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_narrative_claims_user_kind
  ON public.narrative_claims (user_id, claim_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_claims_user_status
  ON public.narrative_claims (user_id, status)
  WHERE status = 'active';


CREATE TABLE IF NOT EXISTS public.narrative_claim_edges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  from_claim_id   UUID        NOT NULL REFERENCES public.narrative_claims(id) ON DELETE CASCADE,
  to_claim_id     UUID        NOT NULL REFERENCES public.narrative_claims(id) ON DELETE CASCADE,

  relation        TEXT        NOT NULL
    CHECK (relation IN (
      'evidences',
      'interpreted_as',
      'means_for',
      'derived_from',
      'contradicts',
      'supersedes',
      'caused',
      'led_to'
    )),

  confidence      FLOAT       NOT NULL DEFAULT 1.0
    CHECK (confidence >= 0.05 AND confidence <= 1.0),

  meta            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT narrative_claim_edges_no_self_loop
    CHECK (from_claim_id <> to_claim_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_narrative_claim_edges_unique
  ON public.narrative_claim_edges (user_id, from_claim_id, to_claim_id, relation);

CREATE INDEX IF NOT EXISTS idx_narrative_claim_edges_to
  ON public.narrative_claim_edges (user_id, to_claim_id, relation);

CREATE INDEX IF NOT EXISTS idx_narrative_claim_edges_from
  ON public.narrative_claim_edges (user_id, from_claim_id, relation);


-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.narrative_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_claim_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own narrative claims"
  ON public.narrative_claims FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own narrative claim edges"
  ON public.narrative_claim_edges FOR SELECT
  USING (auth.uid() = user_id);

-- Service role writes (no INSERT/UPDATE policies for clients)

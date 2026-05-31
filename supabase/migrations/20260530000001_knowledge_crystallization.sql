-- ============================================================================
-- KNOWLEDGE CRYSTALLIZATION
--
-- Two tables that form LoreBook's first durable knowledge layer.
-- Sits above the pattern/event/arc layer in the cognition stack:
--
--   resolved_events → event_candidates → life_arcs
--   ↓
--   crystallized_knowledge      ← this migration
--   ↓
--   (future) principles
--
-- Design invariants:
--   1. Claims are never deleted — HISTORICAL / SUPERSEDED are archival states.
--   2. Every claim must have at least one knowledge_evidence_links row.
--   3. AI-sourced omega_claims must never become evidence (enforced at app layer).
--   4. Identity systems do not generate knowledge (enforced at app layer).
--   5. Both machine_claim and human_readable_claim are required — dual representation.
-- ============================================================================

-- ─── crystallized_knowledge ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crystallized_knowledge (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── Dual representation ──────────────────────────────────────────────────
  -- machine_claim: concise, type-consistent, used for scoring and retrieval
  --   e.g. "behavioral_pattern:commits_to_long_technical_projects"
  machine_claim         TEXT        NOT NULL,

  -- human_readable_claim: narrative sentence for display, biographies, memoir
  --   e.g. "You consistently commit to long technical projects under pressure."
  human_readable_claim  TEXT        NOT NULL,

  -- ── Knowledge taxonomy ───────────────────────────────────────────────────
  knowledge_type        TEXT        NOT NULL
    CHECK (knowledge_type IN (
      'behavioral_pattern',
      'value',
      'belief',
      'skill',
      'relationship',
      'lesson',
      'preference',
      'career',
      'creative',
      'identity',
      'health',
      'location'
    )),

  -- ── Lifecycle ────────────────────────────────────────────────────────────
  -- PENDING      → awaiting evidence maturation (reflection trigger only)
  -- ACTIVE       → currently supported by evidence, injected into prompt
  -- DORMANT      → evidence aged, confidence degraded, not shown in prompt
  -- HISTORICAL   → arc closed, user superseded, or correction applied
  -- SUPERSEDED   → replaced by a newer stronger claim on the same subject
  status                TEXT        NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PENDING', 'ACTIVE', 'DORMANT', 'HISTORICAL', 'SUPERSEDED')),

  -- Chain pointer: SUPERSEDED claims point to the claim that replaced them.
  -- Walk superseded_by_id recursively to see full evolution of any claim.
  superseded_by_id      UUID        REFERENCES public.crystallized_knowledge(id) ON DELETE SET NULL,

  -- For PENDING claims only: do not crystallize before this timestamp.
  -- Null for all other statuses.
  crystallize_after     TIMESTAMPTZ,

  -- ── Confidence ───────────────────────────────────────────────────────────
  confidence            FLOAT       NOT NULL
    CHECK (confidence >= 0.05 AND confidence <= 0.95),

  -- All five factor values stored permanently.
  -- Schema: { base_evidence, temporal_stability, cross_context,
  --           recency_factor, contradiction_penalty, computed_at }
  confidence_breakdown  JSONB       NOT NULL DEFAULT '{}',

  -- ── Provenance ───────────────────────────────────────────────────────────
  -- What kind of event triggered crystallization
  trigger_type          TEXT        NOT NULL
    CHECK (trigger_type IN ('pattern_threshold', 'arc_close', 'user_reflection')),

  -- UUID of the arc or event_candidate that fired the trigger
  trigger_id            UUID,

  -- ── Temporal span of supporting evidence ─────────────────────────────────
  first_evidenced_at    TIMESTAMPTZ,
  last_reinforced_at    TIMESTAMPTZ,

  -- ── Future layer flags ───────────────────────────────────────────────────
  -- principle_eligible: claim is strong/cross-contextual enough to eventually
  -- contribute to a future Principle synthesis (Memory→Event→Pattern→Knowledge→Principle).
  -- Never set automatically in MVP — reserved for v4+.
  principle_eligible    BOOLEAN     NOT NULL DEFAULT false,

  -- biography_eligible: claim has been reviewed and is appropriate for
  -- inclusion in generated memoir/biography text. Reserved for future use.
  biography_eligible    BOOLEAN     NOT NULL DEFAULT false,

  -- arc_close_eligible: claim's evidence set includes at least one life_arc
  -- with sufficient membership to participate in arc-close synthesis (v2).
  arc_close_eligible    BOOLEAN     NOT NULL DEFAULT false,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplication: one active claim per user/type/machine_claim combination.
-- ON CONFLICT on this index triggers an update rather than a duplicate insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crystallized_knowledge_dedup
  ON public.crystallized_knowledge (user_id, knowledge_type, machine_claim)
  WHERE status NOT IN ('HISTORICAL', 'SUPERSEDED');

-- Primary prompt-builder query: ACTIVE claims for a user, ranked by confidence.
CREATE INDEX IF NOT EXISTS idx_crystallized_knowledge_prompt
  ON public.crystallized_knowledge (user_id, confidence DESC)
  WHERE status = 'ACTIVE';

-- Evidence view query: all claims for a user in any status.
CREATE INDEX IF NOT EXISTS idx_crystallized_knowledge_user
  ON public.crystallized_knowledge (user_id, created_at DESC);

-- Supersedence chain traversal.
CREATE INDEX IF NOT EXISTS idx_crystallized_knowledge_superseded_by
  ON public.crystallized_knowledge (superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- Dormancy job: find claims past their reinforcement window.
CREATE INDEX IF NOT EXISTS idx_crystallized_knowledge_reinforced
  ON public.crystallized_knowledge (user_id, last_reinforced_at)
  WHERE status = 'ACTIVE';

-- Pending queue job: claims ready to crystallize.
CREATE INDEX IF NOT EXISTS idx_crystallized_knowledge_pending
  ON public.crystallized_knowledge (crystallize_after)
  WHERE status = 'PENDING';


-- ─── knowledge_evidence_links ─────────────────────────────────────────────────
--
-- Polymorphic evidence manifest. One row per piece of supporting evidence.
-- evidence_id is not a FK-enforced reference because it spans multiple source
-- tables (event_candidates, life_arcs, arc_memberships, event_interpretations,
-- resolved_events, omega_claims, corrections). Integrity is enforced at the
-- application layer in evidenceCollector.ts.
--
-- A stale link (source row deleted) renders gracefully in the UI as
-- "evidence no longer available" without breaking the claim's existence.

CREATE TABLE IF NOT EXISTS public.knowledge_evidence_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id      UUID        NOT NULL
    REFERENCES public.crystallized_knowledge(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which source table this evidence comes from
  evidence_type     TEXT        NOT NULL
    CHECK (evidence_type IN (
      'event_candidate',
      'life_arc',
      'arc_membership',
      'event_interpretation',
      'resolved_event',
      'omega_claim',
      'correction'
    )),

  -- UUID in the source table (no FK enforced — see comment above)
  evidence_id       UUID        NOT NULL,

  -- This evidence item's contribution to base_evidence in the confidence formula
  evidence_weight   FLOAT       NOT NULL
    CHECK (evidence_weight >= -0.50 AND evidence_weight <= 0.50),

  -- Denormalized display text — avoids N+1 queries in the evidence view UI.
  -- Written at link creation time; may become stale if source row changes,
  -- but is treated as a snapshot of what was true when the claim was made.
  evidence_summary  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary evidence view query: all links for a claim.
CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_knowledge_id
  ON public.knowledge_evidence_links (knowledge_id);

-- Reverse lookup: which claims does an event_candidate support?
-- Used to update confidence when a candidate changes.
CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_source
  ON public.knowledge_evidence_links (evidence_type, evidence_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_user
  ON public.knowledge_evidence_links (user_id);


-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.crystallized_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own knowledge claims"
  ON public.crystallized_knowledge FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own knowledge claims"
  ON public.crystallized_knowledge FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge claims"
  ON public.crystallized_knowledge FOR UPDATE
  USING (auth.uid() = user_id);

-- Users cannot delete knowledge claims — archival is enforced via status transitions.
-- Service role can delete for admin/data-purge operations only.

CREATE POLICY "Service role full access to crystallized_knowledge"
  ON public.crystallized_knowledge
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own evidence links"
  ON public.knowledge_evidence_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own evidence links"
  ON public.knowledge_evidence_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to knowledge_evidence_links"
  ON public.knowledge_evidence_links
  USING (auth.role() = 'service_role');


-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_crystallized_knowledge_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crystallized_knowledge_updated_at
  BEFORE UPDATE ON public.crystallized_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_crystallized_knowledge_updated_at();

-- Knowledge Kernel foundation
--
-- Adds the first-class assertion and derivation primitives missing from the
-- existing cognition graph. Existing books remain the source of product
-- behavior while adapters are introduced incrementally.

CREATE TABLE IF NOT EXISTS public.knowledge_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,
  subject_id UUID,
  subject_label TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_value JSONB NOT NULL DEFAULT 'null'::jsonb,
  assertion_class TEXT NOT NULL CHECK (assertion_class IN (
    'observation', 'experience', 'statement', 'belief', 'hypothesis',
    'decision', 'reflection'
  )),
  domain TEXT NOT NULL CHECK (domain IN (
    'identity', 'relationship', 'emotion', 'goal', 'project', 'skill',
    'preference', 'location', 'community', 'career', 'health', 'event', 'world'
  )),
  epistemic_stance TEXT NOT NULL CHECK (epistemic_stance IN (
    'direct_observation', 'reported_statement', 'user_belief',
    'system_hypothesis', 'established_knowledge'
  )),
  asserted_by_kind TEXT NOT NULL CHECK (asserted_by_kind IN (
    'user', 'lorebook', 'external_person', 'document_author',
    'imported_source', 'unknown'
  )),
  asserted_by_id UUID,
  asserted_by_label TEXT,
  derivation_method TEXT NOT NULL CHECK (derivation_method IN (
    'directly_stated', 'quoted', 'extracted', 'calculated', 'inferred',
    'user_confirmed'
  )),
  polarity TEXT NOT NULL DEFAULT 'affirmed'
    CHECK (polarity IN ('affirmed', 'uncertain', 'negated')),
  certainty DOUBLE PRECISION CHECK (certainty IS NULL OR (certainty >= 0 AND certainty <= 1)),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed', 'active', 'challenged', 'superseded', 'retracted', 'rejected'
  )),
  sensitivity TEXT NOT NULL DEFAULT 'standard' CHECK (sensitivity IN (
    'standard', 'sensitive', 'high_impact', 'restricted'
  )),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  extraction_method TEXT,
  source_table TEXT,
  source_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_assertions_valid_time CHECK (
    valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to
  ),
  CONSTRAINT knowledge_assertions_source_pair CHECK (
    (source_table IS NULL AND source_id IS NULL)
    OR (source_table IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT knowledge_assertions_high_impact_review CHECK (
    sensitivity NOT IN ('high_impact', 'restricted')
    OR status <> 'active'
    OR derivation_method = 'user_confirmed'
  ),
  CONSTRAINT knowledge_assertions_direct_not_inferred CHECK (
    epistemic_stance <> 'direct_observation'
    OR derivation_method <> 'inferred'
  )
);

CREATE INDEX IF NOT EXISTS knowledge_assertions_subject_idx
  ON public.knowledge_assertions (user_id, subject_kind, subject_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_assertions_active_idx
  ON public.knowledge_assertions (user_id, domain, epistemic_stance, recorded_at DESC)
  WHERE status IN ('proposed', 'active', 'challenged');

CREATE INDEX IF NOT EXISTS knowledge_assertions_source_idx
  ON public.knowledge_assertions (user_id, source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.assertion_revision_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_assertion_id UUID NOT NULL REFERENCES public.knowledge_assertions(id) ON DELETE CASCADE,
  to_assertion_id UUID NOT NULL REFERENCES public.knowledge_assertions(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN (
    'supersedes', 'corrects', 'retracts', 'narrows', 'expands'
  )),
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assertion_revision_links_not_self CHECK (from_assertion_id <> to_assertion_id),
  UNIQUE (user_id, from_assertion_id, to_assertion_id, relation)
);

CREATE INDEX IF NOT EXISTS assertion_revision_links_from_idx
  ON public.assertion_revision_links (user_id, from_assertion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assertion_revision_links_to_idx
  ON public.assertion_revision_links (user_id, to_assertion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assertion_revision_links_from_fk_idx
  ON public.assertion_revision_links (from_assertion_id);

CREATE INDEX IF NOT EXISTS assertion_revision_links_to_fk_idx
  ON public.assertion_revision_links (to_assertion_id);

CREATE TABLE IF NOT EXISTS public.knowledge_derivation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  derivation_type TEXT NOT NULL,
  algorithm_name TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  prompt_version TEXT,
  model_provider TEXT,
  model_name TEXT,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'degraded', 'failed', 'invalidated')),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_derivation_runs_user_idx
  ON public.knowledge_derivation_runs (user_id, derivation_type, started_at DESC);

CREATE TABLE IF NOT EXISTS public.knowledge_derivation_io (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  derivation_run_id UUID NOT NULL
    REFERENCES public.knowledge_derivation_runs(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('input', 'output', 'rejected')),
  artifact_type TEXT NOT NULL,
  artifact_id UUID NOT NULL,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (derivation_run_id, direction, artifact_type, artifact_id)
);

CREATE INDEX IF NOT EXISTS knowledge_derivation_io_artifact_idx
  ON public.knowledge_derivation_io (user_id, artifact_type, artifact_id);

-- Kernel tables are server-owned. Explicit grants are required because new
-- Supabase projects no longer expose public-schema tables automatically.
REVOKE ALL ON TABLE
  public.knowledge_assertions,
  public.assertion_revision_links,
  public.knowledge_derivation_runs,
  public.knowledge_derivation_io
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.knowledge_assertions,
  public.assertion_revision_links,
  public.knowledge_derivation_runs,
  public.knowledge_derivation_io
TO service_role;

-- Some historical environments recorded the cognition substrate as applied
-- without retaining/replaying its SQL. Bootstrap the shared evidence store so
-- Knowledge Kernel remains installable on those environments. This is the
-- same base shape used by the cognition graph migration.
CREATE TABLE IF NOT EXISTS public.assertion_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN (
    'node', 'edge', 'narrative_claim', 'knowledge_assertion',
    'perception_entry', 'crystallized_knowledge'
  )),
  target_id UUID NOT NULL,
  evidence_kind TEXT NOT NULL,
  evidence_id UUID NOT NULL,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assertion_evidence_target
  ON public.assertion_evidence (user_id, target_kind, target_id);

ALTER TABLE public.assertion_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.assertion_evidence FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assertion_evidence TO service_role;

-- Extend the shared evidence store rather than creating a competing table.
ALTER TABLE public.assertion_evidence
  DROP CONSTRAINT IF EXISTS assertion_evidence_target_kind_check;

ALTER TABLE public.assertion_evidence
  ADD CONSTRAINT assertion_evidence_target_kind_check CHECK (target_kind IN (
    'node', 'edge', 'narrative_claim', 'knowledge_assertion',
    'perception_entry', 'crystallized_knowledge'
  ));

ALTER TABLE public.assertion_evidence
  ADD COLUMN IF NOT EXISTS relation TEXT NOT NULL DEFAULT 'supports'
    CHECK (relation IN ('supports', 'challenges', 'contextualizes', 'duplicates', 'irrelevant')),
  ADD COLUMN IF NOT EXISTS locator JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_by TEXT NOT NULL DEFAULT 'system'
    CHECK (linked_by IN ('user', 'system', 'import')),
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS extraction_confidence DOUBLE PRECISION
    CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1));

DROP INDEX IF EXISTS public.idx_assertion_evidence_unique;
CREATE UNIQUE INDEX idx_assertion_evidence_unique
  ON public.assertion_evidence (
    user_id, target_kind, target_id, evidence_kind, evidence_id, relation
  );

ALTER TABLE public.knowledge_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assertion_revision_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_derivation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_derivation_io ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_assertions_owner_read
  ON public.knowledge_assertions FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY knowledge_assertions_owner_insert
  ON public.knowledge_assertions FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY assertion_revision_links_owner_read
  ON public.assertion_revision_links FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY assertion_revision_links_owner_insert
  ON public.assertion_revision_links FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.knowledge_assertions a
      WHERE a.id = from_assertion_id AND a.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.knowledge_assertions a
      WHERE a.id = to_assertion_id AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY knowledge_derivation_runs_owner_read
  ON public.knowledge_derivation_runs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY knowledge_derivation_io_owner_read
  ON public.knowledge_derivation_io FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.knowledge_assertions IS
  'Append-oriented epistemic assertions. Corrections create linked replacements rather than overwriting meaning.';

COMMENT ON COLUMN public.knowledge_assertions.certainty IS
  'Certainty in the assertion support, not a probability that reality is known.';

COMMENT ON TABLE public.knowledge_derivation_runs IS
  'Auditable, versioned derivations used to produce materialized knowledge projections.';

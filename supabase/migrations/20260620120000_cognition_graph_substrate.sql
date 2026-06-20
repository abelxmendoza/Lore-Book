-- ============================================================================
-- COGNITION GRAPH SUBSTRATE — unified nodes, edges, identity, provenance, salience
-- Extends narrative_claims with bi-temporal + epistemic fields; adds decision kind.
-- ============================================================================

-- Extend narrative claim kinds
ALTER TABLE public.narrative_claims
  DROP CONSTRAINT IF EXISTS narrative_claims_claim_kind_check;

ALTER TABLE public.narrative_claims
  ADD CONSTRAINT narrative_claims_claim_kind_check
  CHECK (claim_kind IN ('fact', 'event', 'evidence', 'interpretation', 'meaning', 'decision'));

ALTER TABLE public.narrative_claims
  ADD COLUMN IF NOT EXISTS epistemic_state TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (epistemic_state IN ('UNKNOWN', 'POSSIBLE', 'LIKELY', 'VERIFIED', 'CONTRADICTED', 'DEPRECATED'));

ALTER TABLE public.narrative_claims
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;

ALTER TABLE public.narrative_claims
  ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;

ALTER TABLE public.narrative_claims
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.narrative_claims
  ADD COLUMN IF NOT EXISTS asserted_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.narrative_claims
  ADD COLUMN IF NOT EXISTS extraction_method TEXT;

CREATE INDEX IF NOT EXISTS idx_narrative_claims_epistemic
  ON public.narrative_claims (user_id, epistemic_state)
  WHERE epistemic_state NOT IN ('DEPRECATED');

-- Unified graph nodes
CREATE TABLE IF NOT EXISTS public.graph_nodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_kind       TEXT NOT NULL CHECK (node_kind IN (
    'person', 'place', 'organization', 'event', 'relationship',
    'skill', 'artifact', 'goal', 'decision', 'concept', 'group'
  )),
  root_type       TEXT NOT NULL,
  classification_id UUID,
  machine_key     TEXT,
  display_name    TEXT NOT NULL,
  epistemic_state TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (epistemic_state IN ('UNKNOWN', 'POSSIBLE', 'LIKELY', 'VERIFIED', 'CONTRADICTED', 'DEPRECATED')),
  confidence      FLOAT NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.05 AND confidence <= 0.99),
  valid_from      TIMESTAMPTZ,
  valid_to        TIMESTAMPTZ,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  asserted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  extraction_method TEXT,
  source_table    TEXT,
  source_id       UUID,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT graph_nodes_source_pair
    CHECK (
      (source_table IS NULL AND source_id IS NULL)
      OR (source_table IS NOT NULL AND source_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_nodes_source_bridge
  ON public.graph_nodes (user_id, source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_nodes_active_machine_key
  ON public.graph_nodes (user_id, node_kind, machine_key)
  WHERE machine_key IS NOT NULL AND valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_graph_nodes_user_kind
  ON public.graph_nodes (user_id, node_kind, created_at DESC);

-- Unified graph edges
CREATE TABLE IF NOT EXISTS public.graph_edges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_node_id    UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  to_node_id      UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  relation_kind   TEXT NOT NULL,
  confidence      FLOAT NOT NULL DEFAULT 0.7
    CHECK (confidence >= 0.05 AND confidence <= 1.0),
  epistemic_state TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (epistemic_state IN ('UNKNOWN', 'POSSIBLE', 'LIKELY', 'VERIFIED', 'CONTRADICTED', 'DEPRECATED')),
  valid_from      TIMESTAMPTZ,
  valid_to        TIMESTAMPTZ,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  asserted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  extraction_method TEXT,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT graph_edges_no_self_loop CHECK (from_node_id <> to_node_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_unique_active
  ON public.graph_edges (user_id, from_node_id, to_node_id, relation_kind)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_graph_edges_from
  ON public.graph_edges (user_id, from_node_id);

CREATE INDEX IF NOT EXISTS idx_graph_edges_to
  ON public.graph_edges (user_id, to_node_id);

-- Identity aliases (fragmentation prevention)
CREATE TABLE IF NOT EXISTS public.entity_aliases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id     UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  alias_kind  TEXT NOT NULL DEFAULT 'nickname'
    CHECK (alias_kind IN ('nickname', 'kinship', 'misspelling', 'former_name', 'abbreviation')),
  confidence  FLOAT NOT NULL DEFAULT 0.8,
  source      TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_aliases_unique
  ON public.entity_aliases (user_id, lower(alias));

CREATE INDEX IF NOT EXISTS idx_entity_aliases_node
  ON public.entity_aliases (user_id, node_id);

-- Merge audit trail
CREATE TABLE IF NOT EXISTS public.entity_merge_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  survivor_node_id  UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  merged_node_id    UUID NOT NULL,
  merge_reason      TEXT,
  evidence          JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_by         TEXT NOT NULL DEFAULT 'system',
  merged_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_merge_log_user
  ON public.entity_merge_log (user_id, merged_at DESC);

-- Provenance-first evidence bundles
CREATE TABLE IF NOT EXISTS public.assertion_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('node', 'edge', 'narrative_claim')),
  target_id       UUID NOT NULL,
  evidence_kind   TEXT NOT NULL,
  evidence_id     UUID NOT NULL,
  weight          FLOAT NOT NULL DEFAULT 0.7,
  excerpt         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assertion_evidence_target
  ON public.assertion_evidence (user_id, target_kind, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assertion_evidence_unique
  ON public.assertion_evidence (user_id, target_kind, target_id, evidence_kind, evidence_id);

-- Materialized salience scores
CREATE TABLE IF NOT EXISTS public.salience_scores (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind   TEXT NOT NULL,
  target_id     UUID NOT NULL,
  score         FLOAT NOT NULL DEFAULT 0.5,
  components    JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_salience_scores_rank
  ON public.salience_scores (user_id, score DESC);

-- RLS
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_merge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assertion_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salience_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY graph_nodes_user ON public.graph_nodes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY graph_edges_user ON public.graph_edges FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY entity_aliases_user ON public.entity_aliases FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY entity_merge_log_user ON public.entity_merge_log FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY assertion_evidence_user ON public.assertion_evidence FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY salience_scores_user ON public.salience_scores FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Phase 2: Temporal Edges and Relationship Snapshots
-- Enables relationship intelligence: when, how long, how strong; phases and episodic closure

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- temporal_edges: temporal model for relationship lifecycle (start, end, evidence, active)
CREATE TABLE IF NOT EXISTS public.temporal_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_entity_id UUID NOT NULL,
  to_entity_id UUID NOT NULL,
  from_entity_type TEXT NOT NULL CHECK (from_entity_type IN ('omega_entity', 'character')),
  to_entity_type TEXT NOT NULL CHECK (to_entity_type IN ('omega_entity', 'character')),
  relationship_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ASSERTED', 'EPISODIC')),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  last_evidence_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_source_ids UUID[] DEFAULT '{}'::uuid[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One active edge per (user, from, to, relationship_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_temporal_edges_active_unique
  ON public.temporal_edges (user_id, from_entity_id, to_entity_id, relationship_type)
  WHERE (active = true);

CREATE INDEX IF NOT EXISTS idx_temporal_edges_user ON public.temporal_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_temporal_edges_user_kind_active ON public.temporal_edges(user_id, kind, active);
CREATE INDEX IF NOT EXISTS idx_temporal_edges_last_evidence ON public.temporal_edges(user_id, last_evidence_at);

COMMENT ON TABLE public.temporal_edges IS 'Temporal relationship edges: start/end, evidence, active. Feeds from writeRelationship for character_relationships and entity_relationships.';
COMMENT ON COLUMN public.temporal_edges.kind IS 'ASSERTED=lasting, EPISODIC=event-specific (subject to episodic closure).';
COMMENT ON COLUMN public.temporal_edges.last_evidence_at IS 'When we last saw evidence for this edge; used for recency and episodic closure.';

-- relationship_snapshots: derived phase and confidence per temporal edge
CREATE TABLE IF NOT EXISTS public.relationship_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES public.temporal_edges(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('EVENT', 'CORE', 'ACTIVE', 'WEAK', 'DORMANT')),
  confidence FLOAT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(relationship_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_snapshots_relationship ON public.relationship_snapshots(relationship_id);

COMMENT ON TABLE public.relationship_snapshots IS 'Derived phase (EVENT/CORE/ACTIVE/WEAK/DORMANT) and confidence per temporal edge. Upserted after writeRelationship.';

-- RLS: temporal_edges
ALTER TABLE public.temporal_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own temporal edges"
  ON public.temporal_edges FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own temporal edges"
  ON public.temporal_edges FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own temporal edges"
  ON public.temporal_edges FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: relationship_snapshots (user-scoped via join through temporal_edges)
ALTER TABLE public.relationship_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own relationship snapshots"
  ON public.relationship_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.temporal_edges te
      WHERE te.id = relationship_snapshots.relationship_id AND te.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own relationship snapshots"
  ON public.relationship_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.temporal_edges te
      WHERE te.id = relationship_snapshots.relationship_id AND te.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own relationship snapshots"
  ON public.relationship_snapshots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.temporal_edges te
      WHERE te.id = relationship_snapshots.relationship_id AND te.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.temporal_edges te
      WHERE te.id = relationship_snapshots.relationship_id AND te.user_id = auth.uid()
    )
  );

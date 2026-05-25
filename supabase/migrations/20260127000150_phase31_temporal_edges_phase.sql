-- Phase 3.1: temporal_edges.phase (CORE|ACTIVE|WEAK|DORMANT|ENDED) and relationship_snapshots phase CHECK + ENDED

-- temporal_edges: add phase column
ALTER TABLE public.temporal_edges
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE public.temporal_edges
  DROP CONSTRAINT IF EXISTS temporal_edges_phase_check;
ALTER TABLE public.temporal_edges
  ADD CONSTRAINT temporal_edges_phase_check
  CHECK (phase IN ('CORE','ACTIVE','WEAK','DORMANT','ENDED'));

CREATE INDEX IF NOT EXISTS idx_temporal_edges_phase ON public.temporal_edges(user_id, phase);

COMMENT ON COLUMN public.temporal_edges.phase IS 'Current relationship phase: CORE, ACTIVE, WEAK, DORMANT, ENDED. Source of truth for queries; evolve job updates.';

-- relationship_snapshots: allow ENDED in phase (keep EVENT for legacy)
ALTER TABLE public.relationship_snapshots
  DROP CONSTRAINT IF EXISTS relationship_snapshots_phase_check;
ALTER TABLE public.relationship_snapshots
  ADD CONSTRAINT relationship_snapshots_phase_check
  CHECK (phase IN ('EVENT','CORE','ACTIVE','WEAK','DORMANT','ENDED'));

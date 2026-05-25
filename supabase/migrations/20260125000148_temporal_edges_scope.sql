-- Phase 2.1: Add scope to temporal_edges and relationship_snapshots
-- Scope = context of a relationship (work, family, romantic, stress, etc.); part of edge identity.

-- temporal_edges: add scope column
ALTER TABLE public.temporal_edges
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';

-- Allow only allowed scope values (optional constraint)
ALTER TABLE public.temporal_edges
  DROP CONSTRAINT IF EXISTS temporal_edges_scope_check;
ALTER TABLE public.temporal_edges
  ADD CONSTRAINT temporal_edges_scope_check
  CHECK (scope IN ('global','work','family','romantic','friendship','health','stress','creative','transition'));

-- Replace unique index to include scope (one active edge per user, from, to, type, scope)
DROP INDEX IF EXISTS public.idx_temporal_edges_active_unique;
CREATE UNIQUE INDEX idx_temporal_edges_active_unique
  ON public.temporal_edges (user_id, from_entity_id, to_entity_id, relationship_type, scope)
  WHERE (active = true);

CREATE INDEX IF NOT EXISTS idx_temporal_edges_scope ON public.temporal_edges(user_id, scope);

COMMENT ON COLUMN public.temporal_edges.scope IS 'Context of the relationship: global, work, family, romantic, friendship, health, stress, creative, transition.';

-- relationship_snapshots: add scope column
ALTER TABLE public.relationship_snapshots
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';

-- Backfill from temporal_edges
UPDATE public.relationship_snapshots rs
SET scope = COALESCE(te.scope, 'global')
FROM public.temporal_edges te
WHERE te.id = rs.relationship_id;

COMMENT ON COLUMN public.relationship_snapshots.scope IS 'Copied from temporal_edges; enables scoped queries.';

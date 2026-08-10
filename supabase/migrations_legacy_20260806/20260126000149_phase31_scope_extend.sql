-- Phase 3.1: Extend temporal_edges scope CHECK to include 'friends' and 'spiritual'

ALTER TABLE public.temporal_edges
  DROP CONSTRAINT IF EXISTS temporal_edges_scope_check;

ALTER TABLE public.temporal_edges
  ADD CONSTRAINT temporal_edges_scope_check
  CHECK (scope IN (
    'global','work','family','romantic','friendship','health','stress','creative','transition',
    'friends','spiritual'
  ));

COMMENT ON COLUMN public.temporal_edges.scope IS 'Context: global, work, family, romantic, friendship, friends, health, stress, creative, transition, spiritual.';

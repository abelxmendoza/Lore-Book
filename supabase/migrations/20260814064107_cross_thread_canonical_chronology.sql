-- Cross-thread chronology keeps three clocks separate and accumulates every
-- supporting thread/message on one canonical semantic edge.
ALTER TABLE public.canonical_temporal_relations
  ADD COLUMN IF NOT EXISTS source_message_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_thread_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS conversation_time timestamptz,
  ADD COLUMN IF NOT EXISTS knowledge_time timestamptz NOT NULL DEFAULT now();

UPDATE public.canonical_temporal_relations
SET source_message_ids = ARRAY[source_message_id]
WHERE cardinality(source_message_ids) = 0 AND source_message_id IS NOT NULL;

-- Narrative milestones reuse the existing typed graph_nodes/graph_edges substrate.
-- No competing narrative-edge table is introduced.

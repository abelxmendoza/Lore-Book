-- Association Graph edges — the middle layer between mention detection and
-- membership inference. Stores evidence-accumulating ties (attended / visited /
-- worked_with / member_of …) so groups/communities are only ever promoted from
-- recurring evidence, never invented from a single co-mention.
--
-- Core principle: association is the default; membership must be earned.

CREATE TABLE IF NOT EXISTS public.association_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  target_kind TEXT NOT NULL DEFAULT 'unknown',

  association_type TEXT NOT NULL,

  confidence NUMERIC NOT NULL DEFAULT 0.2 CHECK (confidence >= 0 AND confidence <= 1),
  mention_count INTEGER NOT NULL DEFAULT 1,

  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  supporting_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

  promoted_from TEXT,
  promoted_to TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per (user, source, type, target) — the graph edge key.
  UNIQUE (user_id, source_entity_id, association_type, target_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_association_edges_user_source
  ON public.association_edges(user_id, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_association_edges_user_target
  ON public.association_edges(user_id, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_association_edges_user_type
  ON public.association_edges(user_id, association_type);

ALTER TABLE public.association_edges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'association_edges' AND policyname = 'association_edges_user'
  ) THEN
    CREATE POLICY association_edges_user ON public.association_edges
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

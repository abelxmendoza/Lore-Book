-- Relative chronology is canonical knowledge even when neither subject has an
-- exact date. These rows preserve the evidence and never manufacture dates.
CREATE TABLE IF NOT EXISTS public.canonical_temporal_relations (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_ref_type text NOT NULL,
  source_ref_id text,
  source_label text NOT NULL,
  target_ref_type text NOT NULL,
  target_ref_id text,
  target_label text NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN (
    'BEFORE', 'AFTER', 'OVERLAPS', 'DURING', 'CONTAINS',
    'STARTS_NEAR', 'ENDS_NEAR', 'SAME_PERIOD_AS'
  )),
  confidence double precision NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_phrase text NOT NULL,
  source_message_id text NOT NULL,
  source_assertion_ids text[] NOT NULL DEFAULT '{}',
  inferred_not_confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canonical_temporal_relations_user_source_idx
  ON public.canonical_temporal_relations (user_id, source_ref_type, source_ref_id);

CREATE INDEX IF NOT EXISTS canonical_temporal_relations_user_target_idx
  ON public.canonical_temporal_relations (user_id, target_ref_type, target_ref_id);

CREATE INDEX IF NOT EXISTS canonical_temporal_relations_user_labels_idx
  ON public.canonical_temporal_relations (user_id, lower(source_label), lower(target_label));

ALTER TABLE public.canonical_temporal_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY canonical_temporal_relations_select_own
  ON public.canonical_temporal_relations
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY canonical_temporal_relations_insert_own
  ON public.canonical_temporal_relations
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY canonical_temporal_relations_update_own
  ON public.canonical_temporal_relations
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY canonical_temporal_relations_delete_own
  ON public.canonical_temporal_relations
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

REVOKE ALL ON TABLE public.canonical_temporal_relations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canonical_temporal_relations TO authenticated;
GRANT ALL ON TABLE public.canonical_temporal_relations TO service_role;

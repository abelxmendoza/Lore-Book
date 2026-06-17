-- Dynamic classifications — subcategories, swimlanes, relationship subtypes.
-- Root types stay in code; specifics grow as rows. See docs/dynamic-classification-model.md.

CREATE TABLE IF NOT EXISTS public.classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  root_type TEXT NOT NULL,
  label TEXT NOT NULL,
  parent_id UUID REFERENCES public.classifications(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'deprecated')),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'system'
    CHECK (created_by IN ('system', 'user', 'llm')),
  canonical_id UUID REFERENCES public.classifications(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_root_label_global
  ON public.classifications (root_type, lower(label))
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_root_label_user
  ON public.classifications (user_id, root_type, lower(label))
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classifications_root_type
  ON public.classifications (root_type, status);

CREATE INDEX IF NOT EXISTS idx_classifications_user
  ON public.classifications (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classifications_parent
  ON public.classifications (parent_id)
  WHERE parent_id IS NOT NULL;

ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classifications'
      AND policyname = 'classifications_global_read'
  ) THEN
    CREATE POLICY classifications_global_read ON public.classifications
      FOR SELECT USING (user_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classifications'
      AND policyname = 'classifications_user'
  ) THEN
    CREATE POLICY classifications_user ON public.classifications
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Seed global location subcategories (spatial ontology alignment)
INSERT INTO public.classifications (user_id, root_type, label, status, confidence, created_by, metadata)
VALUES
  (NULL, 'LOCATION', 'nightclub', 'active', 0.9, 'system', '{"category":"VENUE","subcategory":"NIGHTCLUB"}'::jsonb),
  (NULL, 'LOCATION', 'household', 'active', 0.9, 'system', '{"category":"DWELLING","subcategory":"HOUSEHOLD"}'::jsonb),
  (NULL, 'LOCATION', 'music_venue', 'active', 0.88, 'system', '{"category":"VENUE","subcategory":"MUSIC_VENUE"}'::jsonb),
  (NULL, 'GROUP', 'punk_band', 'active', 0.85, 'system', '{"category":"MUSIC_GROUP","subcategory":"BAND"}'::jsonb),
  (NULL, 'GROUP', 'fight_team', 'active', 0.85, 'system', '{"category":"TEAM","subcategory":"MARTIAL_ARTS"}'::jsonb),
  (NULL, 'EVENT', 'warehouse_show', 'active', 0.85, 'system', '{"category":"SHOW","subcategory":"CONCERT"}'::jsonb),
  (NULL, 'CONCEPT', 'robotics', 'active', 0.8, 'system', '{"axis":"swimlane"}'::jsonb),
  (NULL, 'CONCEPT', 'mma', 'active', 0.8, 'system', '{"axis":"swimlane"}'::jsonb),
  (NULL, 'CONCEPT', 'creative', 'active', 0.8, 'system', '{"axis":"swimlane"}'::jsonb),
  (NULL, 'CONCEPT', 'work', 'active', 0.8, 'system', '{"axis":"swimlane"}'::jsonb),
  (NULL, 'CONCEPT', 'life', 'active', 0.8, 'system', '{"axis":"swimlane"}'::jsonb);

COMMENT ON TABLE public.classifications IS
  'Dynamic classification vocabulary — subcategories and swimlanes keyed by stable root_type.';

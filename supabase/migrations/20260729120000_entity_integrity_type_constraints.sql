-- Align persistence constraints with the canonical entity ontology used by the
-- resolver. Without this, correctly classified tools/projects/products fail to
-- persist and can be coerced into an older person/location/org bucket.

CREATE TABLE IF NOT EXISTS public.entity_merge_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL,
  target_entity_id UUID NOT NULL,
  source_entity_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  merged_by TEXT NOT NULL DEFAULT 'USER' CHECK (merged_by IN ('SYSTEM', 'USER')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversible BOOLEAN NOT NULL DEFAULT true,
  reverted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_entity_merge_records_user_created
  ON public.entity_merge_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_merge_records_source
  ON public.entity_merge_records (source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merge_records_target
  ON public.entity_merge_records (target_entity_id);

ALTER TABLE public.entity_merge_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own entity merge records" ON public.entity_merge_records;
DROP POLICY IF EXISTS "Users can insert own entity merge records" ON public.entity_merge_records;
DROP POLICY IF EXISTS "Users can update own entity merge records" ON public.entity_merge_records;

CREATE POLICY "Users can view own entity merge records"
  ON public.entity_merge_records FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own entity merge records"
  ON public.entity_merge_records FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own entity merge records"
  ON public.entity_merge_records FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE ON public.entity_merge_records TO authenticated;
GRANT ALL ON public.entity_merge_records TO service_role;

ALTER TABLE public.omega_entities
  DROP CONSTRAINT IF EXISTS omega_entities_type_check;

ALTER TABLE public.omega_entities
  ADD CONSTRAINT omega_entities_type_check CHECK (type IN (
    'PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT',
    'PRODUCT', 'APP', 'BRAND', 'PROJECT', 'SKILL', 'PET',
    'VEHICLE', 'MEDIA', 'FOOD_DRINK', 'UNKNOWN'
  )) NOT VALID;

ALTER TABLE public.omega_entities
  VALIDATE CONSTRAINT omega_entities_type_check;

ALTER TABLE public.entity_merge_records
  DROP CONSTRAINT IF EXISTS entity_merge_records_source_entity_type_check,
  DROP CONSTRAINT IF EXISTS entity_merge_records_target_entity_type_check;

ALTER TABLE public.entity_merge_records
  ADD CONSTRAINT entity_merge_records_source_entity_type_check CHECK (source_entity_type IN (
    'CHARACTER', 'PERSON', 'LOCATION', 'COUNTRY', 'CITY', 'ORG', 'ORGANIZATION',
    'SCHOOL', 'ENTITY', 'CONCEPT', 'APP', 'SOFTWARE_TOOL', 'PROJECT', 'PRODUCT', 'EVENT'
  )) NOT VALID,
  ADD CONSTRAINT entity_merge_records_target_entity_type_check CHECK (target_entity_type IN (
    'CHARACTER', 'PERSON', 'LOCATION', 'COUNTRY', 'CITY', 'ORG', 'ORGANIZATION',
    'SCHOOL', 'ENTITY', 'CONCEPT', 'APP', 'SOFTWARE_TOOL', 'PROJECT', 'PRODUCT', 'EVENT'
  )) NOT VALID;

ALTER TABLE public.entity_merge_records
  VALIDATE CONSTRAINT entity_merge_records_source_entity_type_check;

ALTER TABLE public.entity_merge_records
  VALIDATE CONSTRAINT entity_merge_records_target_entity_type_check;

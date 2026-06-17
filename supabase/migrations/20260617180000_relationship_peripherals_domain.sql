-- Generalize romantic_peripherals → relationship_peripherals (multi-domain vicarious links).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'romantic_peripherals'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'relationship_peripherals'
  ) THEN
    ALTER TABLE public.romantic_peripherals RENAME TO relationship_peripherals;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.relationship_peripherals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL DEFAULT 'romantic',
  anchor_relationship_id UUID REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  anchor_person_id UUID NOT NULL,
  anchor_person_type TEXT NOT NULL CHECK (anchor_person_type IN ('character', 'omega_entity')),
  peripheral_person_id UUID,
  peripheral_person_type TEXT CHECK (peripheral_person_type IN ('character', 'omega_entity')),
  peripheral_surface TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'unknown',
  tier TEXT NOT NULL DEFAULT 'suspected' CHECK (tier IN ('suspected', 'confirmed', 'dismissed')),
  confidence FLOAT NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  has_met BOOLEAN NOT NULL DEFAULT false,
  proximity TEXT NOT NULL DEFAULT 'third_party' CHECK (proximity IN (
    'direct', 'indirect', 'distant', 'unmet', 'third_party'
  )),
  associated_via TEXT DEFAULT 'chat_extract',
  source_message_ids TEXT[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.relationship_peripherals
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'romantic';

ALTER TABLE public.relationship_peripherals
  DROP CONSTRAINT IF EXISTS romantic_peripherals_role_check;

ALTER TABLE public.relationship_peripherals
  DROP CONSTRAINT IF EXISTS relationship_peripherals_role_check;

CREATE INDEX IF NOT EXISTS relationship_peripherals_user_anchor_person_domain_idx
  ON public.relationship_peripherals (user_id, anchor_person_id, domain, tier);

CREATE INDEX IF NOT EXISTS relationship_peripherals_user_anchor_rel_idx
  ON public.relationship_peripherals (user_id, anchor_relationship_id);

DROP INDEX IF EXISTS public.romantic_peripherals_dedup_idx;
DROP INDEX IF EXISTS public.relationship_peripherals_dedup_idx;

CREATE UNIQUE INDEX IF NOT EXISTS relationship_peripherals_dedup_idx
  ON public.relationship_peripherals (
    user_id,
    anchor_person_id,
    anchor_person_type,
    domain,
    lower(peripheral_surface)
  )
  WHERE tier != 'dismissed';

ALTER TABLE public.relationship_peripherals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS romantic_peripherals_user_policy ON public.relationship_peripherals;
DROP POLICY IF EXISTS relationship_peripherals_user_policy ON public.relationship_peripherals;

CREATE POLICY relationship_peripherals_user_policy ON public.relationship_peripherals
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

COMMENT ON TABLE public.relationship_peripherals IS
  'Vicarious relationship intelligence — other people connected to a subject (any domain).';

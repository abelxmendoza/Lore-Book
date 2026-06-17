-- Vicarious romantic links — other partners/lovers a relationship person may have.

CREATE TABLE IF NOT EXISTS public.romantic_peripherals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  anchor_relationship_id UUID REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  anchor_person_id UUID NOT NULL,
  anchor_person_type TEXT NOT NULL CHECK (anchor_person_type IN ('character', 'omega_entity')),

  peripheral_person_id UUID,
  peripheral_person_type TEXT CHECK (peripheral_person_type IN ('character', 'omega_entity')),
  peripheral_surface TEXT NOT NULL,

  role TEXT NOT NULL DEFAULT 'unknown' CHECK (role IN (
    'side_partner', 'current_partner', 'ex', 'crush', 'hookup', 'rival', 'unknown'
  )),
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

CREATE INDEX IF NOT EXISTS romantic_peripherals_user_anchor_rel_idx
  ON public.romantic_peripherals (user_id, anchor_relationship_id);

CREATE INDEX IF NOT EXISTS romantic_peripherals_user_anchor_person_idx
  ON public.romantic_peripherals (user_id, anchor_person_id, tier);

CREATE UNIQUE INDEX IF NOT EXISTS romantic_peripherals_dedup_idx
  ON public.romantic_peripherals (
    user_id,
    anchor_person_id,
    anchor_person_type,
    lower(peripheral_surface),
    tier
  )
  WHERE tier != 'dismissed';

ALTER TABLE public.romantic_peripherals ENABLE ROW LEVEL SECURITY;

CREATE POLICY romantic_peripherals_user_policy ON public.romantic_peripherals
  FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE public.romantic_peripherals IS
  'Vicarious romantic intelligence — suspected/confirmed other partners of a relationship person.';

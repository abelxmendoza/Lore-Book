-- =====================================================
-- ENTITY ATTRIBUTES
-- Purpose: Track attributes like occupation, school, workplace, etc.
-- Example: "Sam works as a software engineer at Google"
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.entity_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('omega_entity', 'character')),
  attribute_type TEXT NOT NULL, -- 'occupation', 'school', 'workplace', 'hometown', 'current_city', 'degree', 'major', 'title', 'role', 'company', 'industry'
  attribute_value TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  start_time TIMESTAMPTZ, -- When this attribute became true
  end_time TIMESTAMPTZ,   -- When this attribute ended (if applicable)
  is_current BOOLEAN DEFAULT true,
  evidence_source_ids UUID[], -- IDs of messages/journal entries that support this
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entity_id, entity_type, attribute_type, attribute_value)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_attributes_user ON public.entity_attributes(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_attributes_entity ON public.entity_attributes(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_attributes_type ON public.entity_attributes(attribute_type);
CREATE INDEX IF NOT EXISTS idx_entity_attributes_current ON public.entity_attributes(user_id, is_current) WHERE is_current = true;

-- RLS
ALTER TABLE public.entity_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entity attributes"
  ON public.entity_attributes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entity attributes"
  ON public.entity_attributes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entity attributes"
  ON public.entity_attributes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own entity attributes"
  ON public.entity_attributes FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.entity_attributes IS 'Tracks attributes like occupation, school, workplace for entities';
COMMENT ON COLUMN public.entity_attributes.attribute_type IS 'Type: occupation, school, workplace, hometown, current_city, degree, major, title, role, company, industry';
COMMENT ON COLUMN public.entity_attributes.is_current IS 'Whether this attribute is currently true (vs historical)';

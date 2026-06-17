-- Canonical character authority map: every person-like record resolves to characters.id.

CREATE TABLE IF NOT EXISTS public.character_authority_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL CHECK (source_table IN ('people_places', 'omega_entities', 'characters')),
  source_id UUID NOT NULL,
  alias_name TEXT,
  match_method TEXT NOT NULL DEFAULT 'exact',
  confidence NUMERIC NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_character_authority_map_character
  ON public.character_authority_map (canonical_character_id);

CREATE INDEX IF NOT EXISTS idx_character_authority_map_alias
  ON public.character_authority_map (user_id, alias_name)
  WHERE alias_name IS NOT NULL;

ALTER TABLE public.character_authority_map ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'character_authority_map' AND policyname = 'character_authority_map_user'
  ) THEN
    CREATE POLICY character_authority_map_user ON public.character_authority_map
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

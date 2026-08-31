-- Saga projection hardening. This migration intentionally does not add unique
-- constraints yet: existing duplicate rows must be audited and repaired first.

ALTER TABLE public.narrative_story_chapters
  ADD COLUMN IF NOT EXISTS projection_key TEXT;

ALTER TABLE public.narrative_life_chapters
  ADD COLUMN IF NOT EXISTS projection_key TEXT;

ALTER TABLE public.narrative_life_eras
  ADD COLUMN IF NOT EXISTS projection_key TEXT;

UPDATE public.narrative_story_chapters
SET projection_key = metadata->>'projection_key'
WHERE projection_key IS NULL
  AND metadata ? 'projection_key';

UPDATE public.narrative_life_chapters
SET projection_key = metadata->>'projection_key'
WHERE projection_key IS NULL
  AND metadata ? 'projection_key';

UPDATE public.narrative_life_eras
SET projection_key = metadata->>'projection_key'
WHERE projection_key IS NULL
  AND metadata ? 'projection_key';

CREATE INDEX IF NOT EXISTS narrative_story_chapters_user_projection_key_idx
  ON public.narrative_story_chapters (user_id, projection_key)
  WHERE projection_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS narrative_life_chapters_user_projection_key_idx
  ON public.narrative_life_chapters (user_id, projection_key)
  WHERE projection_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS narrative_life_eras_user_projection_key_idx
  ON public.narrative_life_eras (user_id, projection_key)
  WHERE projection_key IS NOT NULL;

COMMENT ON COLUMN public.narrative_story_chapters.projection_key IS
  'Stable Saga identity key. Add uniqueness only after existing duplicates are repaired.';

COMMENT ON COLUMN public.narrative_life_chapters.projection_key IS
  'Stable Saga identity key. Add uniqueness only after existing duplicates are repaired.';

COMMENT ON COLUMN public.narrative_life_eras.projection_key IS
  'Stable Saga identity key. Add uniqueness only after existing duplicates are repaired.';

CREATE TABLE IF NOT EXISTS public.narrative_projection_generations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('building', 'published', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS narrative_projection_generations_user_published_idx
  ON public.narrative_projection_generations (user_id, published_at DESC)
  WHERE status = 'published';

ALTER TABLE public.narrative_projection_generations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own Saga projection generations"
    ON public.narrative_projection_generations FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages Saga projection generations"
    ON public.narrative_projection_generations FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT ON public.narrative_projection_generations TO authenticated;
GRANT ALL ON public.narrative_projection_generations TO service_role;

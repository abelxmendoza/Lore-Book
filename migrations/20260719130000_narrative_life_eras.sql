-- Mirror of supabase/migrations/20260719130000_narrative_life_eras.sql

CREATE TABLE IF NOT EXISTS public.narrative_life_eras (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL,
  thesis                TEXT,
  time_start            TIMESTAMPTZ,
  time_end              TIMESTAMPTZ,
  location              TEXT,
  participants          TEXT[] NOT NULL DEFAULT '{}',
  chapter_ids           UUID[] NOT NULL DEFAULT '{}',
  scene_ids             UUID[] NOT NULL DEFAULT '{}',
  event_ids             UUID[] NOT NULL DEFAULT '{}',
  themes                TEXT[] NOT NULL DEFAULT '{}',
  dominant_emotion      TEXT,
  is_current            BOOLEAN NOT NULL DEFAULT false,
  significance_score    INTEGER NOT NULL DEFAULT 0
    CHECK (significance_score >= 0 AND significance_score <= 100),
  confidence            FLOAT NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  thread_id             UUID,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_story_chapters
  ADD COLUMN IF NOT EXISTS era_id UUID;

DO $$ BEGIN
  ALTER TABLE public.narrative_story_chapters
    ADD CONSTRAINT narrative_story_chapters_era_id_fkey
    FOREIGN KEY (era_id) REFERENCES public.narrative_life_eras(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_narrative_life_eras_user_time
  ON public.narrative_life_eras (user_id, time_start DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_narrative_life_eras_user_current
  ON public.narrative_life_eras (user_id, is_current)
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_narrative_life_eras_chapters
  ON public.narrative_life_eras USING GIN (chapter_ids);
CREATE INDEX IF NOT EXISTS idx_narrative_story_chapters_era
  ON public.narrative_story_chapters (user_id, era_id)
  WHERE era_id IS NOT NULL;

ALTER TABLE public.narrative_life_eras ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative life eras"
    ON public.narrative_life_eras FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative life eras"
    ON public.narrative_life_eras FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own narrative life eras"
    ON public.narrative_life_eras FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative life eras"
    ON public.narrative_life_eras FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative life eras"
    ON public.narrative_life_eras FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_life_eras TO authenticated;
GRANT ALL ON public.narrative_life_eras TO service_role;

COMMENT ON TABLE public.narrative_life_eras IS
  'Durable life eras assembled from Story Chapters (months-to-years life periods).';

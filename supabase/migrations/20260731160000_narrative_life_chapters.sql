-- Narrative Life Chapters: domain-grouped containers between Story Chapters and Life Eras.
-- Ladder: Moments → Scenes → Story Chapters ("Storylines") → Life Chapters (domains) → Life Eras

CREATE TABLE IF NOT EXISTS public.narrative_life_chapters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain                TEXT NOT NULL,
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL,
  time_start            TIMESTAMPTZ,
  time_end              TIMESTAMPTZ,
  location              TEXT,
  participants          TEXT[] NOT NULL DEFAULT '{}',
  storyline_ids         UUID[] NOT NULL DEFAULT '{}',
  scene_ids             UUID[] NOT NULL DEFAULT '{}',
  event_ids             UUID[] NOT NULL DEFAULT '{}',
  themes                TEXT[] NOT NULL DEFAULT '{}',
  dominant_emotion      TEXT,
  significance_score    INTEGER NOT NULL DEFAULT 0
    CHECK (significance_score >= 0 AND significance_score <= 100),
  confidence            FLOAT NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  era_id                UUID,
  thread_id             UUID,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_story_chapters
  ADD COLUMN IF NOT EXISTS life_chapter_id UUID;

DO $$ BEGIN
  ALTER TABLE public.narrative_story_chapters
    ADD CONSTRAINT narrative_story_chapters_life_chapter_id_fkey
    FOREIGN KEY (life_chapter_id) REFERENCES public.narrative_life_chapters(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.narrative_life_chapters
    ADD CONSTRAINT narrative_life_chapters_era_id_fkey
    FOREIGN KEY (era_id) REFERENCES public.narrative_life_eras(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_narrative_life_chapters_user_time
  ON public.narrative_life_chapters (user_id, time_start DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_narrative_life_chapters_user_created
  ON public.narrative_life_chapters (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_life_chapters_storylines
  ON public.narrative_life_chapters USING GIN (storyline_ids);
CREATE INDEX IF NOT EXISTS idx_narrative_life_chapters_era
  ON public.narrative_life_chapters (user_id, era_id)
  WHERE era_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_narrative_story_chapters_life_chapter
  ON public.narrative_story_chapters (user_id, life_chapter_id)
  WHERE life_chapter_id IS NOT NULL;

ALTER TABLE public.narrative_life_chapters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative life chapters"
    ON public.narrative_life_chapters FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative life chapters"
    ON public.narrative_life_chapters FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own narrative life chapters"
    ON public.narrative_life_chapters FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative life chapters"
    ON public.narrative_life_chapters FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative life chapters"
    ON public.narrative_life_chapters FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_life_chapters TO authenticated;
GRANT ALL ON public.narrative_life_chapters TO service_role;

COMMENT ON TABLE public.narrative_life_chapters IS
  'Domain-grouped life chapters (Career, Family, Creative Work, ...) assembled from Story Chapters ("Storylines"), attached to a Life Era.';

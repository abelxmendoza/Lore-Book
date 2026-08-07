-- Narrative Story Chapters: durable autobiographical spans built from Scenes.
-- Ladder: Moments → Scenes → Canonical Events → Story Chapters → (later) Life Eras
-- Distinct from narrative_chapters (arc-thesis projection keyed by life_arc_id).

CREATE TABLE IF NOT EXISTS public.narrative_story_chapters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL,
  thesis                TEXT,
  time_start            TIMESTAMPTZ,
  time_end              TIMESTAMPTZ,
  location              TEXT,
  participants          TEXT[] NOT NULL DEFAULT '{}',
  scene_ids             UUID[] NOT NULL DEFAULT '{}',
  event_ids             UUID[] NOT NULL DEFAULT '{}',
  themes                TEXT[] NOT NULL DEFAULT '{}',
  dominant_emotion      TEXT,
  significance_score    INTEGER NOT NULL DEFAULT 0
    CHECK (significance_score >= 0 AND significance_score <= 100),
  confidence            FLOAT NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  thread_id             UUID,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_scenes
  ADD COLUMN IF NOT EXISTS chapter_id UUID;

DO $$ BEGIN
  ALTER TABLE public.narrative_scenes
    ADD CONSTRAINT narrative_scenes_chapter_id_fkey
    FOREIGN KEY (chapter_id) REFERENCES public.narrative_story_chapters(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_narrative_story_chapters_user_time
  ON public.narrative_story_chapters (user_id, time_start DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_narrative_story_chapters_user_created
  ON public.narrative_story_chapters (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_story_chapters_scenes
  ON public.narrative_story_chapters USING GIN (scene_ids);
CREATE INDEX IF NOT EXISTS idx_narrative_scenes_chapter
  ON public.narrative_scenes (user_id, chapter_id)
  WHERE chapter_id IS NOT NULL;

ALTER TABLE public.narrative_story_chapters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative story chapters"
    ON public.narrative_story_chapters FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative story chapters"
    ON public.narrative_story_chapters FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own narrative story chapters"
    ON public.narrative_story_chapters FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative story chapters"
    ON public.narrative_story_chapters FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative story chapters"
    ON public.narrative_story_chapters FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_story_chapters TO authenticated;
GRANT ALL ON public.narrative_story_chapters TO service_role;

COMMENT ON TABLE public.narrative_story_chapters IS
  'Durable narrative chapters assembled from Scenes (experiences), not from individual Moments.';

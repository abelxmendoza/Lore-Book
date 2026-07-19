-- Narrative Scenes: continuous experiences between Moments and Canonical Events.
-- Moments → Scenes → Canonical Events → Chapters → Life Eras

-- Moment graph links (flow reconstruction)
ALTER TABLE public.narrative_moments
  ADD COLUMN IF NOT EXISTS previous_moment_id UUID REFERENCES public.narrative_moments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_moment_id UUID REFERENCES public.narrative_moments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scene_id UUID,
  ADD COLUMN IF NOT EXISTS caused_by_moment_id UUID REFERENCES public.narrative_moments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leads_to_moment_id UUID REFERENCES public.narrative_moments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.narrative_scenes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL,

  time_start            TIMESTAMPTZ,
  time_end              TIMESTAMPTZ,
  location              TEXT,
  participants          TEXT[] NOT NULL DEFAULT '{}',
  moment_ids            UUID[] NOT NULL DEFAULT '{}',

  primary_goal          TEXT,
  dominant_emotion      TEXT,
  outcome               TEXT,

  confidence            FLOAT NOT NULL DEFAULT 0.5,
  significance_score    INTEGER NOT NULL DEFAULT 0
    CHECK (significance_score >= 0 AND significance_score <= 100),

  promoted_event_id     UUID REFERENCES public.resolved_events(id) ON DELETE SET NULL,
  thread_id             UUID,

  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from moments.scene_id after scenes table exists
DO $$ BEGIN
  ALTER TABLE public.narrative_moments
    ADD CONSTRAINT narrative_moments_scene_id_fkey
    FOREIGN KEY (scene_id) REFERENCES public.narrative_scenes(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_narrative_scenes_user_time
  ON public.narrative_scenes (user_id, time_start DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_narrative_scenes_user_created
  ON public.narrative_scenes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_scenes_promoted
  ON public.narrative_scenes (user_id, promoted_event_id)
  WHERE promoted_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_narrative_moments_scene
  ON public.narrative_moments (user_id, scene_id)
  WHERE scene_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_narrative_moments_prev
  ON public.narrative_moments (previous_moment_id)
  WHERE previous_moment_id IS NOT NULL;

ALTER TABLE public.narrative_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own narrative scenes"
  ON public.narrative_scenes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own narrative scenes"
  ON public.narrative_scenes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own narrative scenes"
  ON public.narrative_scenes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own narrative scenes"
  ON public.narrative_scenes FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_scenes TO authenticated;
GRANT ALL ON public.narrative_scenes TO service_role;

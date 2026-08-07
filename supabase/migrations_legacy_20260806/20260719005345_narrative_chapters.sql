-- Durable story-driven chapter projection. life_arcs remains the timeline
-- container; this table stores the chapter identity and its evidence gate.

CREATE TABLE IF NOT EXISTS public.narrative_chapters (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  life_arc_id            UUID        NOT NULL UNIQUE REFERENCES public.life_arcs(id) ON DELETE CASCADE,
  title                  TEXT        NOT NULL,
  thesis                 TEXT        NOT NULL,
  dominant_theme         TEXT        NOT NULL,
  start_date             DATE,
  end_date               DATE,
  participant_ids        TEXT[]      NOT NULL DEFAULT '{}',
  location_ids           TEXT[]      NOT NULL DEFAULT '{}',
  supporting_event_ids   UUID[]      NOT NULL DEFAULT '{}',
  background_event_ids   UUID[]      NOT NULL DEFAULT '{}',
  background_context     TEXT[]      NOT NULL DEFAULT '{}',
  outcomes               TEXT[]      NOT NULL DEFAULT '{}',
  contribution_scores    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  quality                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  confidence             REAL        NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  generation_version     TEXT        NOT NULL DEFAULT 'chapter-thesis-v1',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_narrative_chapters_user_time
  ON public.narrative_chapters (user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_narrative_chapters_supporting_events
  ON public.narrative_chapters USING GIN (supporting_event_ids);

ALTER TABLE public.narrative_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own narrative chapters"
  ON public.narrative_chapters FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own narrative chapters"
  ON public.narrative_chapters FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own narrative chapters"
  ON public.narrative_chapters FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own narrative chapters"
  ON public.narrative_chapters FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Service role manages narrative chapters"
  ON public.narrative_chapters FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_chapters TO authenticated;
GRANT ALL ON public.narrative_chapters TO service_role;

COMMENT ON TABLE public.narrative_chapters IS
  'Autobiographical chapters generated thesis-first, with contribution-gated scenes, background context, outcomes, and quality metrics.';

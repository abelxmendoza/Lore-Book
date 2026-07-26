-- Narrative Day Stories: same-day coherent clusters of canonical events,
-- assembled via chronologyV2/narrativeCohesion.ts's participant/location/
-- activity/temporal/causal/thematic scoring (Day Story → Milestone → Period
-- → Arc → Chapter → Era hierarchy, Day Story tier).

CREATE TABLE IF NOT EXISTS public.narrative_day_stories (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date         DATE NOT NULL,
  timezone           TEXT NOT NULL,
  title              TEXT NOT NULL,
  summary            TEXT NOT NULL,
  primary_theme      TEXT,
  secondary_themes   TEXT[] NOT NULL DEFAULT '{}',
  coherence          FLOAT NOT NULL DEFAULT 0
    CHECK (coherence >= 0 AND coherence <= 1),
  significance       INTEGER NOT NULL DEFAULT 0
    CHECK (significance >= 0 AND significance <= 100),
  title_source       TEXT NOT NULL DEFAULT 'SYSTEM_SYNTHESIZED'
    CHECK (title_source IN ('USER_AUTHORED', 'SYSTEM_SYNTHESIZED')),
  evidence_ids       TEXT[] NOT NULL DEFAULT '{}',
  generator_version  TEXT NOT NULL DEFAULT 'v1',
  source_event_set_hash TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.narrative_day_story_events (
  day_story_id   UUID NOT NULL REFERENCES public.narrative_day_stories(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'event'
    CHECK (role IN ('event', 'milestone', 'reflection')),
  segment        TEXT
    CHECK (segment IS NULL OR segment IN ('morning', 'afternoon', 'evening', 'late_night')),
  sequence_hint  TEXT
    CHECK (sequence_hint IS NULL OR sequence_hint IN ('earlier', 'later', 'unordered')),
  PRIMARY KEY (day_story_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_narrative_day_stories_user_date
  ON public.narrative_day_stories (user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_day_story_events_event
  ON public.narrative_day_story_events (event_id);

ALTER TABLE public.narrative_day_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_day_story_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative day stories"
    ON public.narrative_day_stories FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative day stories"
    ON public.narrative_day_stories FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own narrative day stories"
    ON public.narrative_day_stories FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative day stories"
    ON public.narrative_day_stories FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative day stories"
    ON public.narrative_day_stories FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative day story events"
    ON public.narrative_day_story_events FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.narrative_day_stories ds
        WHERE ds.id = day_story_id AND ds.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative day story events"
    ON public.narrative_day_story_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_day_stories TO authenticated;
GRANT ALL ON public.narrative_day_stories TO service_role;
GRANT SELECT ON public.narrative_day_story_events TO authenticated;
GRANT ALL ON public.narrative_day_story_events TO service_role;

COMMENT ON TABLE public.narrative_day_stories IS
  'Same-day coherent clusters of canonical events, assembled via narrativeCohesion.ts scoring. Day Story tier of the Day Story -> Milestone -> Period -> Arc -> Chapter -> Era hierarchy.';
COMMENT ON TABLE public.narrative_day_story_events IS
  'Membership + ordering hints for events within a day story. Writes go through the service layer (dayStoryAssembler.ts) only.';

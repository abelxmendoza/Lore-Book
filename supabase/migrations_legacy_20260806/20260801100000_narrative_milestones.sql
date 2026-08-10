-- Narrative Milestones: significance-gated milestone assessment over canonical
-- events, adapting eventSignificanceService.ts's existing sub-scores into a
-- persisted, reviewable milestone record (Day Story → Milestone → Period →
-- Arc → Chapter → Era hierarchy, Milestone tier).

CREATE TABLE IF NOT EXISTS public.narrative_milestones (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id                  UUID NOT NULL REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  occurred_at               TIMESTAMPTZ,
  first_time                BOOLEAN NOT NULL DEFAULT false,
  transition_strength       INTEGER NOT NULL DEFAULT 0
    CHECK (transition_strength >= 0 AND transition_strength <= 100),
  identity_impact           INTEGER NOT NULL DEFAULT 0
    CHECK (identity_impact >= 0 AND identity_impact <= 100),
  public_commitment         BOOLEAN NOT NULL DEFAULT false,
  project_progress          INTEGER NOT NULL DEFAULT 0
    CHECK (project_progress >= 0 AND project_progress <= 100),
  career_progress           INTEGER NOT NULL DEFAULT 0
    CHECK (career_progress >= 0 AND career_progress <= 100),
  relationship_impact       INTEGER NOT NULL DEFAULT 0
    CHECK (relationship_impact >= 0 AND relationship_impact <= 100),
  emotional_importance      INTEGER NOT NULL DEFAULT 0
    CHECK (emotional_importance >= 0 AND emotional_importance <= 100),
  future_consequence        INTEGER NOT NULL DEFAULT 0
    CHECK (future_consequence >= 0 AND future_consequence <= 100),
  explicit_user_importance  BOOLEAN NOT NULL DEFAULT false,
  final_score               INTEGER NOT NULL DEFAULT 0
    CHECK (final_score >= 0 AND final_score <= 100),
  eligible                  BOOLEAN NOT NULL DEFAULT false,
  reasons                   TEXT[] NOT NULL DEFAULT '{}',
  title_source              TEXT NOT NULL DEFAULT 'SYSTEM_SYNTHESIZED'
    CHECK (title_source IN ('USER_AUTHORED', 'SYSTEM_SYNTHESIZED')),
  evidence_ids              TEXT[] NOT NULL DEFAULT '{}',
  generator_version         TEXT NOT NULL DEFAULT 'v1',
  source_event_set_hash     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_narrative_milestones_user_occurred
  ON public.narrative_milestones (user_id, occurred_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_narrative_milestones_user_eligible
  ON public.narrative_milestones (user_id, eligible)
  WHERE eligible = true;

ALTER TABLE public.narrative_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative milestones"
    ON public.narrative_milestones FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative milestones"
    ON public.narrative_milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own narrative milestones"
    ON public.narrative_milestones FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative milestones"
    ON public.narrative_milestones FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative milestones"
    ON public.narrative_milestones FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_milestones TO authenticated;
GRANT ALL ON public.narrative_milestones TO service_role;

COMMENT ON TABLE public.narrative_milestones IS
  'Significance-gated milestone assessments over canonical events, adapted from eventSignificanceService.ts sub-scores. finalScore >= 60 matches the existing significance_level: major threshold.';

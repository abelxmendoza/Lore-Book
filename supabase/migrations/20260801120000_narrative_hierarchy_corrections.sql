-- Narrative Hierarchy Corrections: user corrections to Day Story / Milestone
-- objects that must survive a rebuild — same "survives regeneration"
-- guarantee as suggestionDismissalService.ts, schema-distinct since these
-- are relationship corrections (remove/merge/split/rename/promote/demote/
-- archive an event<->object link), not name-dismissals.

CREATE TABLE IF NOT EXISTS public.narrative_hierarchy_corrections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_type      TEXT NOT NULL
    CHECK (object_type IN ('day_story', 'milestone')),
  object_id        UUID,
  correction_type  TEXT NOT NULL
    CHECK (correction_type IN ('remove_event', 'merge', 'split', 'rename', 'promote', 'demote', 'archive')),
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narrative_hierarchy_corrections_user_object
  ON public.narrative_hierarchy_corrections (user_id, object_type, object_id);

ALTER TABLE public.narrative_hierarchy_corrections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own narrative hierarchy corrections"
    ON public.narrative_hierarchy_corrections FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own narrative hierarchy corrections"
    ON public.narrative_hierarchy_corrections FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own narrative hierarchy corrections"
    ON public.narrative_hierarchy_corrections FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manages narrative hierarchy corrections"
    ON public.narrative_hierarchy_corrections FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, DELETE ON public.narrative_hierarchy_corrections TO authenticated;
GRANT ALL ON public.narrative_hierarchy_corrections TO service_role;

COMMENT ON TABLE public.narrative_hierarchy_corrections IS
  'User corrections to Day Story / Milestone event memberships that must survive a rebuild. dayStoryAssembler.ts and milestoneClassifier.ts must check this table and exclude previously-corrected relationships before persisting.';

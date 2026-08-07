-- Day-scoped occasion life arcs: "My Cousin Leslie's Graduation Party"
-- Links resolved events + journal moments to named single-day (or weekend) containers.

-- Extend arc_type to include occasion
ALTER TABLE public.life_arcs DROP CONSTRAINT IF EXISTS life_arcs_arc_type_check;
ALTER TABLE public.life_arcs ADD CONSTRAINT life_arcs_arc_type_check
  CHECK (arc_type IN ('life_era','skill','location','work','custom','occasion'));

-- Stable dedup key for occasion arcs (user + occasion_key in metadata)
CREATE UNIQUE INDEX IF NOT EXISTS idx_life_arcs_occasion_key
  ON public.life_arcs (user_id, ((metadata->>'occasion_key')))
  WHERE arc_type = 'occasion' AND (metadata->>'occasion_key') IS NOT NULL;

-- Direct links from occasion arcs to events and moments (not via event_candidates)
CREATE TABLE IF NOT EXISTS public.arc_event_links (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arc_id             UUID        NOT NULL REFERENCES public.life_arcs(id) ON DELETE CASCADE,
  resolved_event_id  UUID        REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  journal_entry_id   UUID        REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  user_presence      TEXT        NOT NULL DEFAULT 'unknown'
                                 CHECK (user_presence IN ('attended','heard_about','unknown')),
  temporal_role      TEXT        NOT NULL DEFAULT 'during'
                                 CHECK (temporal_role IN ('before','during','after','throughout')),
  sort_time          TIMESTAMPTZ,
  importance_score   FLOAT       NOT NULL DEFAULT 0.5,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arc_event_links_has_target
    CHECK (resolved_event_id IS NOT NULL OR journal_entry_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_event_links_event
  ON public.arc_event_links (arc_id, resolved_event_id)
  WHERE resolved_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_event_links_journal
  ON public.arc_event_links (arc_id, journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arc_event_links_arc
  ON public.arc_event_links (arc_id, sort_time);

CREATE INDEX IF NOT EXISTS idx_arc_event_links_user_day
  ON public.arc_event_links (user_id, sort_time);

ALTER TABLE public.arc_event_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY arc_event_links_select ON public.arc_event_links
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY arc_event_links_insert ON public.arc_event_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY arc_event_links_update ON public.arc_event_links
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY arc_event_links_delete ON public.arc_event_links
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY arc_event_links_service ON public.arc_event_links
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.arc_event_links IS 'Links occasion life_arcs to resolved_events and journal_entries with attendance + temporal role';

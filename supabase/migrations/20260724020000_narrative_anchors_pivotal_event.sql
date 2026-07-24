-- Allow pivotal_event as a first-class narrative anchor type (chapter-worthy moments).
-- Safe re-run: drop and recreate check with the expanded enum.

ALTER TABLE public.narrative_anchors
  DROP CONSTRAINT IF EXISTS narrative_anchors_anchor_type_check;

ALTER TABLE public.narrative_anchors
  ADD CONSTRAINT narrative_anchors_anchor_type_check
  CHECK (anchor_type IN (
    'life_era',
    'school_era',
    'work_era',
    'relationship_arc',
    'community',
    'family_period',
    'project_arc',
    'travel_period',
    'recurring_activity',
    'pivotal_event'
  ));

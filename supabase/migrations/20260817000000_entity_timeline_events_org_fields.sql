-- Organizations need richer per-event data than characters/locations do —
-- OrganizationTimelinePanel.tsx renders audience badges (with/without/
-- group-wide), source badges ("Posted"), and per-event involved-character
-- name lists, none of which entity_timeline_events carried at launch.
-- Additive, nullable columns — locations leave them null; no existing rows
-- need backfilling (table has no live-ingested data yet).

ALTER TABLE public.entity_timeline_events
  ADD COLUMN involved_names text[],
  ADD COLUMN audience text CHECK (audience IN ('with_user', 'without_user', 'group_wide')),
  ADD COLUMN source text CHECK (source IN ('conversation', 'user_posted')),
  ADD COLUMN subgroup_names text[];

COMMENT ON COLUMN public.entity_timeline_events.involved_names IS
  'Organization only: character names present in the event, resolved from organization_members roster.';
COMMENT ON COLUMN public.entity_timeline_events.audience IS
  'Organization only: with_user/without_user/group_wide classification, mirrors organizationService.classifyGroupEventAudience.';
COMMENT ON COLUMN public.entity_timeline_events.source IS
  'Organization only: conversation (resolved_events/thread-derived) or user_posted (explicit Life Log post).';
COMMENT ON COLUMN public.entity_timeline_events.subgroup_names IS
  'Organization only: names of member subgroups involved in the event, if any.';

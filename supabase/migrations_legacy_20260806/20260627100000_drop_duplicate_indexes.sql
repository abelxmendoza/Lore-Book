-- Drop redundant duplicate indexes/constraints flagged by the Supabase
-- performance advisor (duplicate_index). Each pair below is byte-identical, so
-- keeping one member preserves all query behavior and uniqueness guarantees
-- while removing dead write/storage overhead.

-- resolved_events: idx_resolved_events_start_time == idx_resolved_events_user
-- (both btree (user_id, start_time DESC)). Keep the start_time-named one.
DROP INDEX IF EXISTS public.idx_resolved_events_user;

-- relationship_peripherals: relationship_peripherals_user_anchor_rel_idx ==
-- romantic_peripherals_user_anchor_rel_idx (both btree (user_id,
-- anchor_relationship_id)). Drop the legacy "romantic_" name.
DROP INDEX IF EXISTS public.romantic_peripherals_user_anchor_rel_idx;

-- skills: two identical UNIQUE constraints on (user_id, skill_name). Drop the
-- redundant one; the remaining constraint still enforces uniqueness.
ALTER TABLE public.skills DROP CONSTRAINT IF EXISTS skills_user_id_skill_name_key;

-- Keep the Supabase migration path aligned with the root event-candidates
-- schema. The recurring-scenes API already treats this field as optional, but
-- selecting a column that does not exist makes PostgREST reject the whole
-- request with 42703/PGRST204.
ALTER TABLE public.event_candidates
  ADD COLUMN IF NOT EXISTS emotional_tone TEXT;

COMMENT ON COLUMN public.event_candidates.emotional_tone IS
  'Optional emotional register inferred for this recurring autobiographical scene.';

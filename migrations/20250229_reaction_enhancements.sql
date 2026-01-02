-- Reaction System Enhancements
-- Adds: resolution states, outcome tracking, stability metrics

-- Add resolution state to reactions
ALTER TABLE public.reaction_entries
ADD COLUMN IF NOT EXISTS resolution_state TEXT DEFAULT 'active' CHECK (resolution_state IN ('active', 'resolved', 'lingering', 'recurring')),
ADD COLUMN IF NOT EXISTS outcome TEXT NULL CHECK (outcome IN ('avoided', 'confronted', 'self_soothed', 'escalated', 'processed', 'other')),
ADD COLUMN IF NOT EXISTS recurrence_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS recovery_time_minutes INTEGER NULL,
ADD COLUMN IF NOT EXISTS intensity_over_time NUMERIC(3,2)[] DEFAULT '{}';

COMMENT ON COLUMN public.reaction_entries.resolution_state IS 'State: active (ongoing), resolved (ended), lingering (low-level ongoing), recurring (comes back)';
COMMENT ON COLUMN public.reaction_entries.outcome IS 'What happened: avoided, confronted, self_soothed, escalated, processed, other';
COMMENT ON COLUMN public.reaction_entries.recurrence_count IS 'How many times this reaction has recurred for the same trigger';
COMMENT ON COLUMN public.reaction_entries.recovery_time_minutes IS 'How long until reaction resolved (in minutes) - tracks resilience';
COMMENT ON COLUMN public.reaction_entries.intensity_over_time IS 'Array of intensity values over time - tracks if intensity trended down';

-- Create index for stability queries
CREATE INDEX IF NOT EXISTS reaction_entries_resolution_state_idx ON public.reaction_entries(user_id, resolution_state, timestamp_started);
CREATE INDEX IF NOT EXISTS reaction_entries_recovery_time_idx ON public.reaction_entries(user_id, recovery_time_minutes)
WHERE recovery_time_minutes IS NOT NULL;

-- Add time-delayed reflection tracking
ALTER TABLE public.reaction_entries
ADD COLUMN IF NOT EXISTS reflection_prompted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS reflection_answered_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS reflection_response TEXT NULL;

COMMENT ON COLUMN public.reaction_entries.reflection_prompted_at IS 'When user was prompted to reflect on this reaction (time-delayed)';
COMMENT ON COLUMN public.reaction_entries.reflection_answered_at IS 'When user responded to reflection prompt';
COMMENT ON COLUMN public.reaction_entries.reflection_response IS 'User response to reflection prompt (e.g., "Does this still feel accurate?")';

-- Create index for reflection prompts
CREATE INDEX IF NOT EXISTS reaction_entries_reflection_pending_idx ON public.reaction_entries(user_id, reflection_prompted_at, reflection_answered_at)
WHERE reflection_prompted_at IS NOT NULL AND reflection_answered_at IS NULL;

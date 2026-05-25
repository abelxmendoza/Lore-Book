-- Perception System Enhancements
-- Adds: Impact on Me (required), Belief Evolution Tracking, Cool-Down Review, Person Sensitivity Flags

-- Add new fields to perception_entries
ALTER TABLE public.perception_entries
ADD COLUMN IF NOT EXISTS impact_on_me TEXT,
ADD COLUMN IF NOT EXISTS original_content TEXT,
ADD COLUMN IF NOT EXISTS evolution_notes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_in_high_emotion BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS review_reminder_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Make impact_on_me required (update existing to have placeholder, then add constraint)
UPDATE public.perception_entries
SET impact_on_me = 'Not specified'
WHERE impact_on_me IS NULL;

ALTER TABLE public.perception_entries
ALTER COLUMN impact_on_me SET NOT NULL;

-- Store original content for evolution tracking
UPDATE public.perception_entries
SET original_content = content
WHERE original_content IS NULL;

COMMENT ON COLUMN public.perception_entries.impact_on_me IS 'REQUIRED: How did believing this affect my actions, emotions, or decisions? Key insight lever - shifts focus away from others.';
COMMENT ON COLUMN public.perception_entries.original_content IS 'Preserve original text for belief evolution tracking - prevents rewriting history';
COMMENT ON COLUMN public.perception_entries.evolution_notes IS 'Array of notes tracking how belief changed over time';
COMMENT ON COLUMN public.perception_entries.created_in_high_emotion IS 'Flag for entries created in high-emotion mode - triggers cool-down review reminders';
COMMENT ON COLUMN public.perception_entries.review_reminder_at IS 'When to remind user to review this entry (for high-emotion entries, typically 7-30 days later)';
COMMENT ON COLUMN public.perception_entries.metadata IS 'Metadata for future AI pattern detection: repeated subjects, low confidence patterns, emotional tone, etc.';

-- Add sensitivity flags to characters (for privacy/ethical controls)
ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS sensitivity_level TEXT DEFAULT 'public' CHECK (sensitivity_level IN ('public', 'private', 'sensitive')),
ADD COLUMN IF NOT EXISTS requires_extra_confirmation BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.characters.sensitivity_level IS 'Privacy/Sensitivity: public (default), private, sensitive. Sensitive requires extra confirmation before adding perceptions.';
COMMENT ON COLUMN public.characters.requires_extra_confirmation IS 'If true, requires extra confirmation before adding perceptions about this person';

-- Set requires_extra_confirmation based on sensitivity_level
UPDATE public.characters
SET requires_extra_confirmation = TRUE
WHERE sensitivity_level = 'sensitive';

-- Create index for cool-down review queries
CREATE INDEX IF NOT EXISTS perception_entries_review_reminder_idx ON public.perception_entries(user_id, review_reminder_at)
WHERE review_reminder_at IS NOT NULL AND review_reminder_at <= NOW();

-- Create index for high-emotion entries
CREATE INDEX IF NOT EXISTS perception_entries_high_emotion_idx ON public.perception_entries(user_id, created_in_high_emotion, created_at)
WHERE created_in_high_emotion = TRUE;

-- Create index for sensitivity filtering
CREATE INDEX IF NOT EXISTS characters_sensitivity_level_idx ON public.characters(user_id, sensitivity_level);

-- System Rule Documentation (stored in metadata)
COMMENT ON TABLE public.perception_entries IS 'HARD RULE: Lorebook records how I experienced and interpreted my life—not the objective truth of others. This table stores YOUR perception at a point in time, NOT objective truth about others.';

-- Add fields to track character proximity, relationship depth, and associations
-- This handles characters that are barely known, never met, or mentioned by others

ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS proximity_level TEXT DEFAULT 'direct' CHECK (proximity_level IN ('direct', 'indirect', 'distant', 'unmet', 'third_party')),
ADD COLUMN IF NOT EXISTS has_met BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS relationship_depth TEXT DEFAULT 'close' CHECK (relationship_depth IN ('close', 'moderate', 'casual', 'acquaintance', 'mentioned_only')),
ADD COLUMN IF NOT EXISTS associated_with_character_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mentioned_by_character_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS context_of_mention TEXT,
ADD COLUMN IF NOT EXISTS likelihood_to_meet TEXT DEFAULT 'likely' CHECK (likelihood_to_meet IN ('likely', 'possible', 'unlikely', 'never'));

COMMENT ON COLUMN public.characters.proximity_level IS 'How directly connected: direct (know them), indirect (through someone), distant (barely know), unmet (never met), third_party (mentioned by others)';
COMMENT ON COLUMN public.characters.has_met IS 'Whether the user has actually met this person in person';
COMMENT ON COLUMN public.characters.relationship_depth IS 'Depth of relationship: close, moderate, casual, acquaintance, mentioned_only';
COMMENT ON COLUMN public.characters.associated_with_character_ids IS 'Array of character IDs this person is associated with (e.g., friend of Sarah)';
COMMENT ON COLUMN public.characters.mentioned_by_character_ids IS 'Array of character IDs who mentioned this person';
COMMENT ON COLUMN public.characters.context_of_mention IS 'Context of how/why this person was mentioned';
COMMENT ON COLUMN public.characters.likelihood_to_meet IS 'Likelihood of meeting this person: likely, possible, unlikely, never';

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS characters_proximity_level_idx ON public.characters(user_id, proximity_level);
CREATE INDEX IF NOT EXISTS characters_has_met_idx ON public.characters(user_id, has_met);
CREATE INDEX IF NOT EXISTS characters_relationship_depth_idx ON public.characters(user_id, relationship_depth);
CREATE INDEX IF NOT EXISTS characters_likelihood_to_meet_idx ON public.characters(user_id, likelihood_to_meet);

-- GIN index for array searches
CREATE INDEX IF NOT EXISTS characters_associated_with_idx ON public.characters USING GIN(associated_with_character_ids);
CREATE INDEX IF NOT EXISTS characters_mentioned_by_idx ON public.characters USING GIN(mentioned_by_character_ids);

-- Add location importance and nickname support
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS is_nickname BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS importance_level TEXT DEFAULT 'minor' CHECK (importance_level IN ('essential', 'major', 'supporting', 'minor', 'ephemeral')),
ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS associated_character_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS associated_location_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS event_context TEXT,
ADD COLUMN IF NOT EXISTS proximity_target TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_locations_is_nickname ON public.locations(user_id, is_nickname);
CREATE INDEX IF NOT EXISTS idx_locations_importance_level ON public.locations(user_id, importance_level);
CREATE INDEX IF NOT EXISTS idx_locations_importance_score ON public.locations(user_id, importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_locations_associated_chars ON public.locations USING GIN(associated_character_ids);
CREATE INDEX IF NOT EXISTS idx_locations_associated_locs ON public.locations USING GIN(associated_location_ids);

COMMENT ON COLUMN public.locations.is_nickname IS 'True if the name field contains a generated nickname rather than a real name';
COMMENT ON COLUMN public.locations.importance_level IS 'Location importance: essential, major, supporting, minor, ephemeral';
COMMENT ON COLUMN public.locations.importance_score IS 'Calculated importance score (0-100) based on visits, frequency, emotional significance, etc.';
COMMENT ON COLUMN public.locations.associated_character_ids IS 'Character IDs associated with this location (e.g., "by Nick''s house")';
COMMENT ON COLUMN public.locations.associated_location_ids IS 'Other location IDs this location is near/related to';
COMMENT ON COLUMN public.locations.event_context IS 'Event context (e.g., "where the fight happened")';
COMMENT ON COLUMN public.locations.proximity_target IS 'Proximity target (e.g., "Nick''s house")';

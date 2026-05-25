-- Add first_name, last_name, and importance_level to characters table
-- Also add nickname field to track if name is a generated nickname

ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS importance_level TEXT DEFAULT 'minor' CHECK (importance_level IN ('protagonist', 'major', 'supporting', 'minor', 'background')),
ADD COLUMN IF NOT EXISTS is_nickname BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 0.0;

COMMENT ON COLUMN public.characters.first_name IS 'First name of the character (if known)';
COMMENT ON COLUMN public.characters.last_name IS 'Last name of the character (if known)';
COMMENT ON COLUMN public.characters.importance_level IS 'Character importance: protagonist, major, supporting, minor, background';
COMMENT ON COLUMN public.characters.is_nickname IS 'True if the name field contains a generated nickname rather than a real name';
COMMENT ON COLUMN public.characters.importance_score IS 'Calculated importance score (0-100) based on mentions, relationships, etc.';

-- Create index for importance filtering
CREATE INDEX IF NOT EXISTS characters_importance_level_idx ON public.characters(user_id, importance_level);
CREATE INDEX IF NOT EXISTS characters_importance_score_idx ON public.characters(user_id, importance_score DESC);

-- Migrate existing data: try to parse names into first/last
-- If name contains space, split it; otherwise keep as first_name
UPDATE public.characters
SET 
  first_name = CASE 
    WHEN name LIKE '% %' THEN SPLIT_PART(name, ' ', 1)
    ELSE name
  END,
  last_name = CASE 
    WHEN name LIKE '% %' THEN SUBSTRING(name FROM POSITION(' ' IN name) + 1)
    ELSE NULL
  END
WHERE first_name IS NULL;

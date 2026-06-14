-- Subskill linking columns on skill_suggestions
ALTER TABLE public.skill_suggestions
  ADD COLUMN IF NOT EXISTS parent_skill_name TEXT,
  ADD COLUMN IF NOT EXISTS related_skill_names JSONB NOT NULL DEFAULT '[]'::jsonb;

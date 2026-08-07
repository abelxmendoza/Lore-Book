-- Narrative Ownership columns on story chapters.
-- A chapter must declare its story contract before collecting evidence.

ALTER TABLE public.narrative_story_chapters
  ADD COLUMN IF NOT EXISTS primary_narrative TEXT,
  ADD COLUMN IF NOT EXISTS primary_subject TEXT,
  ADD COLUMN IF NOT EXISTS primary_conflict TEXT,
  ADD COLUMN IF NOT EXISTS primary_outcome TEXT,
  ADD COLUMN IF NOT EXISTS contribution_scores JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.narrative_story_chapters.primary_narrative IS
  'One-sentence story the chapter owns (Narrative Ownership contract).';
COMMENT ON COLUMN public.narrative_story_chapters.contribution_scores IS
  'Per-scene narrative contribution strengths keyed by scene id.';

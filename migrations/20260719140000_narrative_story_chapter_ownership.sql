-- Mirror of supabase/migrations/20260719140000_narrative_story_chapter_ownership.sql

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

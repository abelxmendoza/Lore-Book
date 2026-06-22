-- Quest Log item metadata on pending quest suggestions (UI routing, not Project Book cards).

ALTER TABLE public.quest_suggestions
  ADD COLUMN IF NOT EXISTS item_type TEXT,
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_project_name TEXT,
  ADD COLUMN IF NOT EXISTS promotion_status TEXT NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalized_title TEXT;

CREATE INDEX IF NOT EXISTS idx_quest_suggestions_item_type
  ON public.quest_suggestions(user_id, item_type)
  WHERE item_type IS NOT NULL;

UPDATE public.quest_suggestions
SET normalized_title = lower(trim(title))
WHERE normalized_title IS NULL;

-- Data Migration: Migrate existing chapters to timelines and link journal_entries
-- This migration should be run after the schema migration

-- Migrate chapters to timelines (life_era type)
INSERT INTO public.timelines (
  id,
  user_id,
  title,
  description,
  timeline_type,
  parent_id,
  start_date,
  end_date,
  tags,
  metadata,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  title,
  description,
  'life_era' as timeline_type,
  parent_id,
  start_date,
  end_date,
  ARRAY[]::TEXT[] as tags,
  '{}'::jsonb as metadata,
  created_at,
  updated_at
FROM public.chapters
WHERE NOT EXISTS (
  SELECT 1 FROM public.timelines WHERE timelines.id = chapters.id
);

-- Link journal_entries to timelines via memberships (based on existing chapter_id)
INSERT INTO public.timeline_memberships (
  user_id,
  journal_entry_id,
  timeline_id,
  role,
  importance_score,
  metadata,
  created_at
)
SELECT
  je.user_id,
  je.id,
  je.chapter_id,
  'primary' as role,
  0.8 as importance_score,
  '{}'::jsonb as metadata,
  NOW() as created_at
FROM public.journal_entries je
WHERE je.chapter_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.timelines WHERE timelines.id = je.chapter_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.timeline_memberships 
    WHERE timeline_memberships.journal_entry_id = je.id 
      AND timeline_memberships.timeline_id = je.chapter_id
  );

-- Populate chronology_index for existing journal entries
INSERT INTO public.chronology_index (
  user_id,
  journal_entry_id,
  start_time,
  end_time,
  time_precision,
  year_bucket,
  month_bucket,
  decade_bucket,
  created_at
)
SELECT
  je.user_id,
  je.id,
  je.date as start_time,
  je.end_time,
  COALESCE(je.time_precision, 'exact') as time_precision,
  EXTRACT(YEAR FROM je.date)::INTEGER as year_bucket,
  DATE_TRUNC('month', je.date)::DATE as month_bucket,
  (EXTRACT(YEAR FROM je.date) / 10)::INTEGER * 10 as decade_bucket,
  NOW() as created_at
FROM public.journal_entries je
WHERE NOT EXISTS (
  SELECT 1 FROM public.chronology_index 
  WHERE chronology_index.journal_entry_id = je.id
);

-- Update journal_entries to set default time_precision and time_confidence if null
UPDATE public.journal_entries
SET 
  time_precision = COALESCE(time_precision, 'exact'),
  time_confidence = COALESCE(time_confidence, 1.0)
WHERE time_precision IS NULL OR time_confidence IS NULL;

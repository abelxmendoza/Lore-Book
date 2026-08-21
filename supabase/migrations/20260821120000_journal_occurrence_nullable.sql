-- Journal occurrence must be nullable. Recording time must not fill it.
-- Do NOT apply this migration from the agent session. Review and apply separately.

COMMENT ON COLUMN public.journal_entries.date IS
  'Autobiographical occurrence only. Null when unknown. Never recording/created_at.';

COMMENT ON COLUMN public.journal_entries."timestamp" IS
  'Mirrors date (occurrence). Null when occurrence is unknown. Do not use created_at for chronology.';

ALTER TABLE public.journal_entries
  ALTER COLUMN date DROP DEFAULT;
ALTER TABLE public.journal_entries
  ALTER COLUMN date DROP NOT NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN "timestamp" DROP DEFAULT;
ALTER TABLE public.journal_entries
  ALTER COLUMN "timestamp" DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_chronology_index() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_buckets RECORD;
BEGIN
  -- Unknown occurrence stays out of dated chronology. created_at is recording
  -- provenance and must never be promoted via COALESCE(..., NOW()).
  IF NEW.date IS NULL THEN
    DELETE FROM public.chronology_index
    WHERE user_id = NEW.user_id
      AND journal_entry_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_buckets
  FROM compute_chronology_buckets(NEW.date, NEW.end_time);

  INSERT INTO public.chronology_index (
    user_id, journal_entry_id, start_time, end_time, time_precision,
    year_bucket, month_bucket, decade_bucket
  )
  VALUES (
    NEW.user_id, NEW.id, NEW.date, NEW.end_time,
    COALESCE(NEW.time_precision, 'approximate'),
    v_buckets.year_bucket, v_buckets.month_bucket, v_buckets.decade_bucket
  )
  ON CONFLICT (user_id, journal_entry_id) DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    time_precision = EXCLUDED.time_precision,
    year_bucket = EXCLUDED.year_bucket,
    month_bucket = EXCLUDED.month_bucket,
    decade_bucket = EXCLUDED.decade_bucket;
  RETURN NEW;
END;
$$;

-- Journal occurrence may be unknown.
-- journal_entries.date is autobiographical occurrence only.
-- created_at remains recordedAt. metadata.mentionedAt remains mention time.
--
-- This migration does NOT rewrite historical dates.
-- Do NOT apply to production until the readiness verdict is READY.

ALTER TABLE public.journal_entries
  ALTER COLUMN date DROP DEFAULT,
  ALTER COLUMN date DROP NOT NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN "timestamp" DROP DEFAULT;

COMMENT ON COLUMN public.journal_entries.date IS
  'Autobiographical occurrence. NULL means unknown when it happened. Never recording time.';

COMMENT ON COLUMN public.journal_entries."timestamp" IS
  'Mirrors date (event occurrence). NULL when occurrence is unknown. Do not use created_at for timeline ordering.';

-- Allow honest unknown precision on undated rows (new inserts only; existing rows unchanged).
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_time_precision_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_time_precision_check
  CHECK (time_precision = ANY (ARRAY[
    'exact'::text, 'day'::text, 'month'::text, 'year'::text, 'approximate'::text, 'unknown'::text
  ]));

-- Chronology index: dated occurrence only. Never COALESCE(date, NOW()).
CREATE OR REPLACE FUNCTION public.sync_chronology_index() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_buckets RECORD;
BEGIN
  IF NEW.date IS NULL THEN
    DELETE FROM public.chronology_index
    WHERE user_id = NEW.user_id AND journal_entry_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_buckets FROM compute_chronology_buckets(NEW.date, NEW.end_time);
  INSERT INTO public.chronology_index (user_id, journal_entry_id, start_time, end_time, time_precision, year_bucket, month_bucket, decade_bucket)
  VALUES (
    NEW.user_id,
    NEW.id,
    NEW.date,
    NEW.end_time,
    COALESCE(NULLIF(NEW.time_precision, 'unknown'), 'exact'),
    v_buckets.year_bucket,
    v_buckets.month_bucket,
    v_buckets.decade_bucket
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

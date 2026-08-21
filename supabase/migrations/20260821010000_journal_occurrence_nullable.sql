-- Journal occurrence storage authority
--
-- OCCURRED  (journal_entries.date)     when the real-world event happened
-- MENTIONED (metadata / classifier)    when the user told LoreBook
-- RECORDED  (journal_entries.created_at) when LoreBook persisted the row
--
-- Additive / backward-compatible:
--   * existing rows are not rewritten
--   * chronology_index historical rows are not rebuilt
--   * NOW() is never assigned to null dates
--
-- Unknown occurrence is stored as NULL. Recording time must never fill date.

ALTER TABLE public.journal_entries
  ALTER COLUMN date DROP DEFAULT;

ALTER TABLE public.journal_entries
  ALTER COLUMN date DROP NOT NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN "timestamp" DROP DEFAULT;

COMMENT ON COLUMN public.journal_entries.date IS
  'Occurrence only: when the described real-world event happened. NULL means unknown occurrence. Never store created_at / recording time here.';

COMMENT ON COLUMN public.journal_entries.created_at IS
  'Recording time: when LoreBook persisted this journal entry. Provenance, not biography.';

COMMENT ON COLUMN public.journal_entries.updated_at IS
  'When this journal row last changed. Not occurrence.';

COMMENT ON COLUMN public.journal_entries."timestamp" IS
  'Mirrors date (occurrence). NULL when occurrence is unknown. Do not use created_at for timeline ordering.';

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_time_precision_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_time_precision_check
  CHECK (
    time_precision IS NULL
    OR time_precision = ANY (ARRAY['exact'::text, 'day'::text, 'month'::text, 'year'::text, 'approximate'::text, 'unknown'::text])
  );

-- Dated chronology only. Unknown occurrence must not mint start_time via NOW().
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
  INSERT INTO public.chronology_index (
    user_id, journal_entry_id, start_time, end_time, time_precision,
    year_bucket, month_bucket, decade_bucket
  )
  VALUES (
    NEW.user_id, NEW.id, NEW.date, NEW.end_time,
    COALESCE(NULLIF(NEW.time_precision, 'unknown'), 'day'),
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
END; $$;

COMMENT ON FUNCTION public.sync_chronology_index() IS
  'Indexes dated journal occurrence only. NULL date omits the row from chronology_index; never COALESCE(date, NOW()).';

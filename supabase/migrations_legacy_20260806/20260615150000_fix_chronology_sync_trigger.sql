-- Fix sync_chronology_index: journal_entries uses `date`, not `start_time`
CREATE OR REPLACE FUNCTION sync_chronology_index()
RETURNS TRIGGER AS $$
DECLARE
  v_buckets RECORD;
  v_start TIMESTAMPTZ;
BEGIN
  v_start := COALESCE(NEW.date, NOW());

  SELECT * INTO v_buckets FROM compute_chronology_buckets(
    v_start,
    NEW.end_time
  );

  INSERT INTO public.chronology_index (
    user_id,
    journal_entry_id,
    start_time,
    end_time,
    time_precision,
    year_bucket,
    month_bucket,
    decade_bucket
  ) VALUES (
    NEW.user_id,
    NEW.id,
    v_start,
    NEW.end_time,
    COALESCE(NEW.time_precision, 'exact'),
    v_buckets.year_bucket,
    v_buckets.month_bucket,
    v_buckets.decade_bucket
  )
  ON CONFLICT (user_id, journal_entry_id)
  DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    time_precision = EXCLUDED.time_precision,
    year_bucket = EXCLUDED.year_bucket,
    month_bucket = EXCLUDED.month_bucket,
    decade_bucket = EXCLUDED.decade_bucket;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger fires on date changes (the column we actually have)
DROP TRIGGER IF EXISTS sync_chronology_index_trigger ON public.journal_entries;
CREATE TRIGGER sync_chronology_index_trigger
  AFTER INSERT OR UPDATE OF date, end_time, time_precision ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION sync_chronology_index();

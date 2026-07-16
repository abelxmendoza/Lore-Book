-- Resolved Events: Interval Index + Temporal Range Column
--
-- Adds a tstzrange column to resolved_events so temporal range queries
-- (stabbing, overlap, first-occurrence) run in O(log n) via GiST rather than O(n).
--
-- NOTE: timestamptz + interval is not IMMUTABLE, so we cannot use GENERATED ALWAYS.
-- Maintain time_range via trigger instead.

DO $$
BEGIN
  IF to_regclass('public.resolved_events') IS NULL THEN
    RAISE NOTICE 'resolved_events_interval_index: resolved_events missing; skip';
    RETURN;
  END IF;

  ALTER TABLE resolved_events
    ADD COLUMN IF NOT EXISTS time_range tstzrange;
END $$;

CREATE OR REPLACE FUNCTION resolved_events_set_time_range()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    NEW.time_range := tstzrange(NEW.start_time, NEW.end_time, '[)');
  ELSIF NEW.start_time IS NOT NULL THEN
    NEW.time_range := tstzrange(NEW.start_time, NEW.start_time + interval '2 hours', '[)');
  ELSE
    NEW.time_range := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.resolved_events') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_resolved_events_time_range ON resolved_events;
  CREATE TRIGGER trg_resolved_events_time_range
    BEFORE INSERT OR UPDATE OF start_time, end_time
    ON resolved_events
    FOR EACH ROW
    EXECUTE FUNCTION resolved_events_set_time_range();

  -- Backfill existing rows
  UPDATE resolved_events
  SET time_range = CASE
    WHEN start_time IS NOT NULL AND end_time IS NOT NULL
      THEN tstzrange(start_time, end_time, '[)')
    WHEN start_time IS NOT NULL
      THEN tstzrange(start_time, start_time + interval '2 hours', '[)')
    ELSE NULL
  END
  WHERE time_range IS NULL;

  CREATE INDEX IF NOT EXISTS idx_resolved_events_timerange
    ON resolved_events USING GIST (user_id, time_range)
    WHERE time_range IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_resolved_events_start_time
    ON resolved_events (user_id, start_time ASC NULLS LAST)
    WHERE start_time IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_resolved_events_people
    ON resolved_events USING GIN (people)
    WHERE people IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_resolved_events_activities
    ON resolved_events USING GIN (activities)
    WHERE activities IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION events_at_time(p_user_id uuid, p_ts timestamptz)
RETURNS SETOF resolved_events
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM resolved_events
  WHERE user_id = p_user_id
    AND time_range @> p_ts
  ORDER BY start_time DESC;
$$;

CREATE OR REPLACE FUNCTION events_in_range(p_user_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS SETOF resolved_events
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM resolved_events
  WHERE user_id = p_user_id
    AND time_range && tstzrange(p_start, p_end, '[)')
  ORDER BY start_time ASC;
$$;

CREATE OR REPLACE FUNCTION first_event_mentioning(p_user_id uuid, p_keywords text[])
RETURNS SETOF resolved_events
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT re.*
  FROM resolved_events re
  JOIN event_mentions em ON em.resolved_event_id = re.id
  JOIN journal_entries je ON je.id = em.journal_entry_id
  WHERE re.user_id = p_user_id
    AND (
      re.title ILIKE ANY(SELECT '%' || k || '%' FROM unnest(p_keywords) k)
      OR re.summary ILIKE ANY(SELECT '%' || k || '%' FROM unnest(p_keywords) k)
      OR je.content ILIKE ANY(SELECT '%' || k || '%' FROM unnest(p_keywords) k)
    )
  ORDER BY re.start_time ASC NULLS LAST
  LIMIT 1;
$$;

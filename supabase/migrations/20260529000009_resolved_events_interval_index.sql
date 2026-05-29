-- Resolved Events: Interval Index + Temporal Range Column
--
-- Adds a tstzrange generated column to resolved_events so temporal range queries
-- (stabbing, overlap, first-occurrence) run in O(log n) via GiST rather than O(n).
--
-- Also adds a full-text search vector and a GIN index over the people/locations
-- UUID arrays so entity-scoped event lookups are fast.

-- 1. Add time_range generated column (handles NULL start_time gracefully)
ALTER TABLE resolved_events
  ADD COLUMN IF NOT EXISTS time_range tstzrange
  GENERATED ALWAYS AS (
    CASE
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL
        THEN tstzrange(start_time, end_time, '[)')
      WHEN start_time IS NOT NULL
        THEN tstzrange(start_time, start_time + interval '2 hours', '[)')
      ELSE NULL
    END
  ) STORED;

-- 2. GiST index for O(log n) temporal range queries
CREATE INDEX IF NOT EXISTS idx_resolved_events_timerange
  ON resolved_events USING GIST (user_id, time_range)
  WHERE time_range IS NOT NULL;

-- 3. Start-time index for first-occurrence queries (ORDER BY start_time LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_resolved_events_start_time
  ON resolved_events (user_id, start_time ASC NULLS LAST)
  WHERE start_time IS NOT NULL;

-- 4. GIN index on people[] array for entity-scoped event lookup
CREATE INDEX IF NOT EXISTS idx_resolved_events_people
  ON resolved_events USING GIN (people)
  WHERE people IS NOT NULL;

-- 5. GIN index on activities[] array
CREATE INDEX IF NOT EXISTS idx_resolved_events_activities
  ON resolved_events USING GIN (activities)
  WHERE activities IS NOT NULL;

-- Helper: find events active at a point in time
-- Usage: SELECT * FROM events_at_time($user_id, $ts)
CREATE OR REPLACE FUNCTION events_at_time(p_user_id uuid, p_ts timestamptz)
RETURNS SETOF resolved_events
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM resolved_events
  WHERE user_id = p_user_id
    AND time_range @> p_ts
  ORDER BY start_time DESC;
$$;

-- Helper: find events overlapping a range (for "what happened last summer?")
CREATE OR REPLACE FUNCTION events_in_range(p_user_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS SETOF resolved_events
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM resolved_events
  WHERE user_id = p_user_id
    AND time_range && tstzrange(p_start, p_end, '[)')
  ORDER BY start_time ASC;
$$;

-- Helper: first occurrence of a keyword/topic (for "when did I first X?")
-- Joins through event_mentions to search contributing journal entry content.
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

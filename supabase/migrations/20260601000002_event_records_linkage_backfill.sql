-- ============================================================================
-- MIGRATION: event_records resolved_event_id backfill
-- Phase B of the Event Intelligence Linkage Sprint
--
-- PURPOSE
-- =======
-- Best-effort backfill of the resolved_event_id FK for all existing
-- event_records. Uses the same date-join logic that is currently used in
-- production retrieval, so accuracy is equivalent to current behavior.
-- Idempotent: can be rerun safely at any time.
--
-- EXPECTED ACCURACY
-- =================
-- ~80% correct for same-day documented events (the common case).
-- ~0% for retroactive documentation (user journals next day or later) —
--   these remain NULL and continue using the date-join fallback in retrieval.
-- For same-day events with multiple resolved_events on the same calendar date,
--   the highest-confidence resolved_event is selected (ORDER BY confidence DESC).
--
-- EDGE CASES
-- ==========
-- 1. Multiple resolved_events on same day → highest confidence wins.
--    Risk: low. Most users have at most one significant event per day.
--
-- 2. Multiple event_records on same day → each gets linked to best resolved_event.
--    If two event_records cover different events on the same day, both will
--    be linked to the same resolved_event. This is the same ambiguity that
--    exists in current date-join retrieval — no regression, just made explicit.
--
-- 3. event_records with no matching resolved_event on that date → remain NULL.
--    These are retroactively documented events. The date-join fallback handles
--    them as before. They will be linked properly once the user revisits the
--    event in chat (Phase C2 — Reflection writer linking).
--
-- 4. resolved_events with no matching event_records → unaffected.
--    Many resolved_events will have no linked event_records (no emotional
--    extraction happened). This is expected and correct — the Meaning Tab
--    simply shows nothing for those events, same as today.
--
-- FAILURE MODES
-- =============
-- - If resolved_events table is empty: UPDATE affects 0 rows. Safe.
-- - If event_records table is empty: UPDATE affects 0 rows. Safe.
-- - If the FK references a deleted resolved_event: ON DELETE SET NULL ensures
--   the link is automatically cleared if the parent is deleted.
--
-- IDEMPOTENCY
-- ===========
-- The WHERE resolved_event_id IS NULL clause ensures this UPDATE never
-- overwrites explicit links set by the application layer (Phase C1, C2, D).
-- Rerunning this migration will only affect records that are still unlinked.
--
-- ROLLBACK
-- ========
-- UPDATE public.event_records SET resolved_event_id = NULL;
-- (Resets all links to NULL — safe because the date join remains as fallback)
--
-- INSTRUMENTATION QUERIES (run before and after to measure impact)
-- ================================================================
-- Before: SELECT COUNT(*) total, COUNT(resolved_event_id) linked FROM event_records;
-- After:  SELECT COUNT(*) total, COUNT(resolved_event_id) linked FROM event_records;
-- ============================================================================

-- Best-effort backfill: link event_records to resolved_events by date proximity.
-- For each unlinked event_record, find the resolved_event on the same calendar
-- date for the same user, preferring higher confidence when multiple exist.
--
-- The subquery is correlated: for each event_record row, it searches
-- resolved_events independently. This is safe for the one-time backfill
-- but would be expensive at scale — hence it runs once as a migration,
-- not as an ongoing query.
UPDATE public.event_records er
SET resolved_event_id = (
  SELECT re.id
  FROM public.resolved_events re
  WHERE re.user_id = er.user_id
    -- Same calendar day (date cast strips time component)
    AND re.start_time::date = er.event_date::date
  ORDER BY
    re.confidence DESC,          -- prefer higher-confidence events
    re.created_at DESC           -- prefer more recently assembled events (tie-break)
  LIMIT 1
)
WHERE er.resolved_event_id IS NULL   -- never overwrite explicit application-layer links
  AND EXISTS (                        -- only process rows where a match is possible
    SELECT 1
    FROM public.resolved_events re2
    WHERE re2.user_id = er.user_id
      AND re2.start_time::date = er.event_date::date
  );

-- Post-backfill instrumentation snapshot.
-- This DO block logs the counts to the PostgreSQL log for audit purposes.
-- In production, also run the SELECT queries manually to capture the numbers.
DO $$
DECLARE
  v_total    BIGINT;
  v_linked   BIGINT;
  v_unlinked BIGINT;
BEGIN
  SELECT COUNT(*),
         COUNT(resolved_event_id),
         COUNT(*) - COUNT(resolved_event_id)
  INTO v_total, v_linked, v_unlinked
  FROM public.event_records;

  RAISE NOTICE 'Event Intelligence Linkage — Phase B backfill complete';
  RAISE NOTICE '  Total event_records : %', v_total;
  RAISE NOTICE '  Linked              : % (%.1f%%)', v_linked,
    CASE WHEN v_total > 0 THEN (v_linked::float / v_total * 100) ELSE 0 END;
  RAISE NOTICE '  Unlinked            : % (%.1f%%)', v_unlinked,
    CASE WHEN v_total > 0 THEN (v_unlinked::float / v_total * 100) ELSE 0 END;
  RAISE NOTICE '  Linked records will use FK path; unlinked continue date-join fallback.';
END;
$$;

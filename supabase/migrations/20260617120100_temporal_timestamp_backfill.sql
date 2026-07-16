-- Temporal authority: journal_entries.timestamp must mirror event date, not ingestion time.
-- Prior migration backfilled timestamp from created_at — this corrects that drift.

UPDATE public.journal_entries
SET timestamp = date
WHERE date IS NOT NULL
  AND (timestamp IS NULL OR timestamp IS DISTINCT FROM date);

COMMENT ON COLUMN public.journal_entries.timestamp IS
  'Mirrors date (event occurrence). Do not use created_at for timeline ordering.';

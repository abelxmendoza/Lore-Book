-- Temporal Correctness Phase: recording time must never masquerade as event
-- time. Event time becomes nullable + carries precision/source/status so the
-- UI can be honest about what is actually known. Additive; no backfill here
-- (legacy rows read as recording_fallback/unanchored via column defaults,
-- which is the truthful description of how their start_time was produced).

ALTER TABLE public.resolved_events ALTER COLUMN start_time DROP NOT NULL;

ALTER TABLE public.resolved_events
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS temporal_precision text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS temporal_source text NOT NULL DEFAULT 'recording_fallback',
  ADD COLUMN IF NOT EXISTS temporal_confidence real,
  ADD COLUMN IF NOT EXISTS temporal_expression text,
  ADD COLUMN IF NOT EXISTS temporal_status text NOT NULL DEFAULT 'unanchored';

CREATE INDEX IF NOT EXISTS resolved_events_temporal_status_idx
  ON public.resolved_events (user_id, temporal_status);

COMMENT ON COLUMN public.resolved_events.temporal_precision IS
  'exact|time_of_day|date|month|season|year|unknown — precision of the temporal evidence';
COMMENT ON COLUMN public.resolved_events.temporal_source IS
  'user_corrected|user_stated|document_stated|relative_expression|context_inferred|recording_fallback';
COMMENT ON COLUMN public.resolved_events.temporal_status IS
  'anchored|approximate|ambiguous|unanchored|corrected';

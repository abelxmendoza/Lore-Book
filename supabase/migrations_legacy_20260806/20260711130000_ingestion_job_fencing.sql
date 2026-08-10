-- =====================================================
-- Ingestion job fencing tokens (stale worker protection)
-- =====================================================
-- Prevents a reclaimed job from being completed by a dead worker's late write.

ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS lease_token text,
  ADD COLUMN IF NOT EXISTS attempt_version integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ingestion_jobs_lease_token_idx
  ON public.ingestion_jobs (lease_token)
  WHERE lease_token IS NOT NULL;

COMMENT ON COLUMN public.ingestion_jobs.lease_token IS
  'Worker lease identity; fenced updates require matching lease_token + attempt_version.';
COMMENT ON COLUMN public.ingestion_jobs.attempt_version IS
  'Monotonic attempt fence; reclaimed jobs get a new version on next claim.';

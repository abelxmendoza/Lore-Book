-- =====================================================
-- Ingestion job state machine (autobiographical durability)
-- =====================================================
-- Strengthens ingestion_jobs so assistant-response failure never erases
-- observability of message save + ingestion progress. Additive only.

-- Explicit state-machine columns (wire status column remains for back-compat)
ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS logical_status text,
  ADD COLUMN IF NOT EXISTS current_stage text,
  ADD COLUMN IF NOT EXISTS completed_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS failed_stage text,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_category text,
  ADD COLUMN IF NOT EXISTS retryable boolean,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingestion_version integer NOT NULL DEFAULT 1;

-- Keep completed rows for a short audit window instead of only-delete on success.
-- Existing code may still delete; this index supports status-based scans either way.
CREATE INDEX IF NOT EXISTS ingestion_jobs_status_user_idx
  ON public.ingestion_jobs (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ingestion_jobs_logical_status_idx
  ON public.ingestion_jobs (logical_status, next_retry_at)
  WHERE logical_status IS NOT NULL
    AND logical_status IN ('QUEUED', 'PROCESSING', 'PARTIAL', 'RETRYABLE_FAILED');

CREATE INDEX IF NOT EXISTS ingestion_jobs_stale_lock_idx
  ON public.ingestion_jobs (locked_at)
  WHERE locked_at IS NOT NULL AND status IN ('pending', 'processing');

-- Client idempotency for chat message acceptance (user + key)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_user_client_idempotency_uidx
  ON public.chat_messages (user_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.chat_messages.client_idempotency_key IS
  'Client-generated send attempt key; scoped unique per user to prevent duplicate user rows on retry.';

COMMENT ON COLUMN public.ingestion_jobs.logical_status IS
  'Explicit state machine: RECEIVED|PERSISTED|QUEUED|PROCESSING|PARTIAL|COMPLETED|RETRYABLE_FAILED|PERMANENT_FAILED|CANCELLED';

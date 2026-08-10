-- =====================================================
-- PIPELINE RUNS
-- Formal Cognition Governance — Phase 6
--
-- Tracks every execution of the 12-step ingestion pipeline,
-- including per-step success/failure and timing data.
--
-- Purpose:
--   - Detect and recover partial-ingestion failures
--   - Surface pipeline health for operational monitoring
--   - Enable reconciliation sweeps that retry failed steps
--   - Provide audit trail for "why wasn't this ingested?"
--
-- Design:
--   - One row per pipeline invocation (one per chat message)
--   - step_results is a JSONB array updated atomically as steps complete
--   - status transitions: running → completed | failed | partial
--   - partial = pipeline started but not all 12 steps succeeded
-- =====================================================

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  job_id           text        NOT NULL,          -- ingestionQueue job ID
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_message_id  uuid,                          -- source chat message
  session_id       text,                          -- conversation session

  -- Status
  status           text        NOT NULL DEFAULT 'running',
  -- Values: 'running' | 'completed' | 'failed' | 'partial'

  -- Timing
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  duration_ms      integer,

  -- Step tracking
  -- Each element: { step: string, success: bool, duration_ms: number, error?: string }
  step_results     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  completed_steps  integer     NOT NULL DEFAULT 0,
  total_steps      integer     NOT NULL DEFAULT 12,

  -- Top-level error (for failed status)
  error            text,
  failed_at_step   text
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Owners can read their own pipeline history
CREATE POLICY "owner_read_pipeline_runs" ON pipeline_runs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role writes only

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Lookup by user + status (for reconciliation sweeps: find all partial runs)
CREATE INDEX IF NOT EXISTS pipeline_runs_status_idx
  ON pipeline_runs (user_id, status, started_at DESC);

-- Lookup by chat message (idempotency guard: was this message already ingested?)
CREATE INDEX IF NOT EXISTS pipeline_runs_message_idx
  ON pipeline_runs (user_id, chat_message_id);

-- Timeline view for operational monitoring
CREATE INDEX IF NOT EXISTS pipeline_runs_timeline_idx
  ON pipeline_runs (user_id, started_at DESC);

-- ─── Reconciliation helper view ───────────────────────────────────────────────
-- Lists all incomplete pipeline runs for the service-role reconciliation sweep

CREATE OR REPLACE VIEW pipeline_runs_incomplete AS
SELECT
  id,
  job_id,
  user_id,
  chat_message_id,
  session_id,
  status,
  started_at,
  completed_steps,
  total_steps,
  failed_at_step,
  error
FROM pipeline_runs
WHERE status IN ('running', 'partial', 'failed')
  AND started_at < now() - interval '5 minutes'; -- grace period for in-flight runs

-- =====================================================
-- Durable ingestion queue (Launch-Readiness Step 2: reliability P0)
-- =====================================================
-- The ingestion queue was in-memory only, so a deploy/crash/OOM lost every
-- queued and in-flight job — i.e. memory the user just created was silently
-- never formed. This table is a durable write-ahead log of unfinished ingestion
-- work: a row is inserted before processing and removed on success. On startup
-- the queue re-enqueues any rows left in 'pending'/'processing' (crash recovery).
--
-- `idempotency_key` (usually the chat_message_id) makes enqueue at-least-once
-- without double-processing the same message.

CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id               uuid PRIMARY KEY,
  idempotency_key  text NOT NULL UNIQUE,
  user_id          uuid NOT NULL,
  chat_message_id  text,
  session_id       text,
  priority         text NOT NULL DEFAULT 'NORMAL',
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending',  -- pending | processing | dead
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Recovery scan only ever looks at unfinished work; partial index keeps it tiny
-- even as millions of jobs flow through (completed rows are deleted, not kept).
CREATE INDEX IF NOT EXISTS ingestion_jobs_resumable_idx
  ON public.ingestion_jobs (created_at)
  WHERE status IN ('pending', 'processing');

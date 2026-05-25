-- Phase 1 · Step 3: Consolidation tracking on entry_ir
-- Adds columns that track promotion from entry_ir → journal_entries.
-- entry_ir is durable infrastructure — do NOT delete rows after consolidation.

ALTER TABLE entry_ir
  ADD COLUMN IF NOT EXISTS consolidated_to         UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consolidated_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consolidation_status    TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (consolidation_status IN ('PENDING', 'CONSOLIDATED', 'SKIPPED', 'QUEUED_FOR_REVIEW')),
  ADD COLUMN IF NOT EXISTS consolidation_skip_reason TEXT;

-- Index for the background consolidation sweep (finds unprocessed IRs)
CREATE INDEX IF NOT EXISTS idx_entry_ir_pending_consolidation
  ON entry_ir (user_id, created_at)
  WHERE consolidation_status = 'PENDING';

-- Index for provenance lookup: given journal_entry.id, find its IR
CREATE INDEX IF NOT EXISTS idx_entry_ir_consolidated_to
  ON entry_ir (consolidated_to)
  WHERE consolidated_to IS NOT NULL;

-- ─── Dead-letter table for failed ingestion jobs ──────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_dead_letter (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID        NOT NULL,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_message_id UUID,
  attempts        INTEGER     NOT NULL DEFAULT 0,
  last_error      TEXT,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_unresolved
  ON ingestion_dead_letter (user_id, created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE ingestion_dead_letter ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_dead_letter' AND policyname = 'service_role_dead_letter'
  ) THEN
    CREATE POLICY service_role_dead_letter ON ingestion_dead_letter
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

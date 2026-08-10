-- Phase 1 · Step 4: Conversation compactions
-- Stores rolling/episodic session summaries produced by the token budget service.
-- INTENTIONALLY separate from journal_entries — synthetic summaries must not
-- pollute autobiographical semantic search.

CREATE TABLE IF NOT EXISTS conversation_compactions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        TEXT        NOT NULL,
  compaction_type   TEXT        NOT NULL CHECK (compaction_type IN ('ROLLING', 'EPISODIC', 'SESSION_CLOSE')),

  -- Range of history turns that were compressed
  turn_range_start  INTEGER     NOT NULL,
  turn_range_end    INTEGER     NOT NULL,
  original_turns    INTEGER     NOT NULL,

  -- The compressed output
  summary           TEXT        NOT NULL,
  summary_tokens    INTEGER     NOT NULL,
  original_tokens   INTEGER     NOT NULL,
  compression_ratio FLOAT       NOT NULL,

  -- Provenance
  model_used        TEXT        NOT NULL,

  -- For retrieval filtering
  key_entities      TEXT[]      DEFAULT '{}',
  key_topics        TEXT[]      DEFAULT '{}',
  time_range_start  TIMESTAMPTZ,
  time_range_end    TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ           -- NULL = keep forever
);

CREATE INDEX IF NOT EXISTS idx_compactions_session
  ON conversation_compactions (user_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compactions_expiry
  ON conversation_compactions (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE conversation_compactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_compactions' AND policyname = 'users_own_compactions'
  ) THEN
    CREATE POLICY users_own_compactions ON conversation_compactions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Memory health view ───────────────────────────────────────────────────────
-- Used by the /api/admin/memory-health endpoint.

CREATE OR REPLACE VIEW memory_health AS
SELECT
  (SELECT count(*) FROM journal_entries)                                          AS total_journal_entries,
  (SELECT count(*) FROM journal_entries WHERE embedding IS NOT NULL)              AS journal_entries_with_embeddings,
  (SELECT count(*) FROM journal_entries WHERE embedding IS NULL)                  AS journal_entries_missing_embeddings,
  (SELECT count(*) FROM journal_entries WHERE metadata->>'source' = 'chat')       AS journal_entries_from_chat,
  (SELECT count(*) FROM entry_ir WHERE consolidation_status = 'PENDING')          AS entry_ir_pending_consolidation,
  (SELECT count(*) FROM entry_ir WHERE consolidation_status = 'CONSOLIDATED')     AS entry_ir_consolidated,
  (SELECT count(*) FROM entry_ir WHERE consolidation_status = 'SKIPPED')          AS entry_ir_skipped,
  (SELECT count(*) FROM characters)                                               AS total_characters,
  (SELECT count(*) FROM characters WHERE embedding IS NULL)                       AS characters_missing_embeddings,
  (SELECT count(*) FROM characters WHERE last_embedded_at < now() - interval '7 days' OR last_embedded_at IS NULL) AS characters_stale_embeddings,
  (SELECT count(*) FROM ingestion_dead_letter WHERE resolved_at IS NULL)          AS dead_letter_unresolved,
  now()                                                                           AS checked_at;

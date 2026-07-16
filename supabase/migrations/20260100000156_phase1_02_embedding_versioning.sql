-- Phase 1 · Step 2: Embedding model versioning
-- Must run before any embeddings are generated at scale.
-- Enables safe model upgrades and selective re-embedding.

-- ─── Versioning columns ──────────────────────────────────────────────────────

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS embedding_model   TEXT    DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_version INTEGER DEFAULT 1;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS embedding_model      TEXT    DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_version    INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_embedded_at     TIMESTAMPTZ;

-- ─── Stale embedding index (used by nightly re-embedding job) ────────────────

-- No now() in predicate (must be IMMUTABLE). Nightly job filters by age at query time.
CREATE INDEX IF NOT EXISTS idx_characters_stale_embedding
  ON characters (user_id, last_embedded_at);

CREATE INDEX IF NOT EXISTS idx_journal_entries_no_embedding
  ON journal_entries (user_id, created_at)
  WHERE embedding IS NULL;

-- ─── Model registry ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS embedding_model_registry (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name  TEXT        NOT NULL UNIQUE,
  version     INTEGER     NOT NULL,
  dimensions  INTEGER     NOT NULL,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at  TIMESTAMPTZ,
  is_current  BOOLEAN     NOT NULL DEFAULT false
);

INSERT INTO embedding_model_registry (model_name, version, dimensions, is_current)
VALUES ('text-embedding-3-small', 1, 1536, true)
ON CONFLICT (model_name) DO NOTHING;

-- RLS
ALTER TABLE embedding_model_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'embedding_model_registry' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON embedding_model_registry
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

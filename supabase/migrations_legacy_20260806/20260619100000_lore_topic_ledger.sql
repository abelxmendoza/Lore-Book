-- Materialized per-topic lore readiness ledger (fast reads + incremental updates)

CREATE TABLE IF NOT EXISTS lore_topic_ledger (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_key             text        NOT NULL,
  topic_label           text        NOT NULL,
  atom_count            integer     NOT NULL DEFAULT 0,
  entry_count           integer     NOT NULL DEFAULT 0,
  word_count            integer     NOT NULL DEFAULT 0,
  progress              numeric(6,4) NOT NULL DEFAULT 0,
  readiness_level       text        NOT NULL DEFAULT 'needs_more',
  can_generate          boolean     NOT NULL DEFAULT false,
  atom_type_counts      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  gaps                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  entity_candidates     jsonb,
  dimension_scores      jsonb,
  time_start            timestamptz,
  time_end              timestamptz,
  total_atoms_snapshot  integer     NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_key)
);

ALTER TABLE lore_topic_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_lore_topic_ledger" ON lore_topic_ledger
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS lore_topic_ledger_user_idx
  ON lore_topic_ledger (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS lore_topic_ledger_user_snapshot_idx
  ON lore_topic_ledger (user_id, total_atoms_snapshot);

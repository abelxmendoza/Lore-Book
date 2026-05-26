-- =====================================================
-- PROVENANCE EDGES
-- Formal Cognition Governance — Phase 6
--
-- Persistent directed graph of causal relationships between
-- every cognition artifact in the system.
--
-- Each edge answers: "this artifact was produced by / derived from / cited from that artifact"
-- with a typed relation, confidence score, and truth-state snapshot at write time.
--
-- This is the infrastructure backbone for:
--   - "Why does Lorekeeper believe this?" (explainability)
--   - Character lifecycle tracing (how did this entity come to exist?)
--   - Correction propagation (what else was derived from this revised artifact?)
--   - Epistemic audit (what was the truth-state when each inference was drawn?)
--
-- Design invariants:
--   - Append-only: edges are facts about what happened; they are never deleted
--   - source → target: source produced / informed target
--   - RLS: owner reads, service-role writes
-- =====================================================

CREATE TABLE IF NOT EXISTS provenance_edges (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source artifact (the cause / origin)
  source_id    uuid        NOT NULL,
  source_type  text        NOT NULL,
  -- Values: 'conversation_message' | 'utterance' | 'extracted_unit'
  --         | 'knowledge_unit' | 'entry_ir' | 'journal_entry'
  --         | 'entity' | 'insight'

  -- Target artifact (the effect / result)
  target_id    uuid        NOT NULL,
  target_type  text        NOT NULL,

  -- Typed causal relation
  relation     text        NOT NULL,
  -- Values: 'EXTRACTED_FROM'   — target was extracted from source
  --         'COMPILED_INTO'    — source was compiled into target (IR → journal_entry)
  --         'REVISED_BY'       — source was superseded by target
  --         'CONTRADICTS'      — source contradicts target
  --         'INFERRED_FROM'    — target was inferred from source
  --         'CITED_IN'         — source was cited when generating target
  --         'MENTIONED_ENTITY' — entity was mentioned in source utterance

  -- Epistemic quality
  confidence   float       NOT NULL DEFAULT 1.0,

  -- Truth-state of the TARGET artifact at the time this edge was written.
  -- Snapshot: the current truth-state may have changed; this records what it was.
  to_truth_state text,

  -- Arbitrary metadata (step name, extraction method, etc.)
  meta         jsonb,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE provenance_edges ENABLE ROW LEVEL SECURITY;

-- Owners can read their own provenance graph
CREATE POLICY "owner_read_provenance_edges" ON provenance_edges
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role writes only; client SDK cannot write provenance edges directly
-- (no INSERT policy — service role bypasses RLS)

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary traversal: "what are all edges that point TO this artifact?" (upstream lineage)
CREATE INDEX IF NOT EXISTS provenance_edges_target_idx
  ON provenance_edges (user_id, target_id, target_type, created_at DESC);

-- Inverse traversal: "what did this artifact produce?" (downstream descendants)
CREATE INDEX IF NOT EXISTS provenance_edges_source_idx
  ON provenance_edges (user_id, source_id, source_type, created_at DESC);

-- Relation-type filtering (e.g. "all MENTIONED_ENTITY edges for user")
CREATE INDEX IF NOT EXISTS provenance_edges_relation_idx
  ON provenance_edges (user_id, relation, created_at DESC);

-- Entity provenance: find all utterances that mentioned a specific entity
CREATE INDEX IF NOT EXISTS provenance_edges_entity_mentions_idx
  ON provenance_edges (user_id, target_id)
  WHERE relation = 'MENTIONED_ENTITY';

-- ─── Export-safe view ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW provenance_edges_export AS
SELECT
  id,
  source_id,
  source_type,
  target_id,
  target_type,
  relation,
  confidence,
  to_truth_state,
  created_at
FROM provenance_edges
WHERE auth.uid() = user_id;

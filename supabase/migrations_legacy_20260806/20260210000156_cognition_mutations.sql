-- =====================================================
-- COGNITION MUTATIONS AUDIT TABLE
-- Identity Integrity Sprint — Phase 2
--
-- Append-only audit log for every mutation to any
-- cognition artifact in the system.
--
-- Purpose:
--   - Provenance-aware history of all truth-state changes
--   - Correction authority audit trail
--   - Foundation for "What The AI Knows About You" diff view
--   - Source of truth for future collaborative memory systems
--
-- Design invariants:
--   - Append-only: no UPDATE or DELETE policies
--   - Owner can only READ their own mutations
--   - Service role can INSERT (server-side pipeline)
--   - before_state / after_state stored as JSONB for flexibility
--   - mutation_type is an open enum (text) for forward-compatibility
-- =====================================================

CREATE TABLE IF NOT EXISTS cognition_mutations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who performed the mutation (same as user_id today; reserved for future delegation)
  actor_id       uuid        NOT NULL,

  -- What artifact was mutated
  artifact_type  text        NOT NULL,
  -- Supported: 'journal_entry' | 'entry_ir' | 'knowledge_unit' | 'utterance'
  --            | 'entity' | 'omega_entity' | 'provenance_edge' | 'insight'

  artifact_id    uuid        NOT NULL,

  -- What kind of mutation occurred
  mutation_type  text        NOT NULL,
  -- Supported: 'TRUTH_STATE_CHANGE' | 'CONTENT_REVISION' | 'ENTITY_MERGE'
  --            | 'PROVENANCE_EDGE_ADDED' | 'CORRECTION' | 'CANON_ESCALATION'
  --            | 'DISPUTE' | 'CONSOLIDATION'

  -- Epistemic state before and after (nullable for initial writes)
  before_state   jsonb,
  after_state    jsonb       NOT NULL,

  -- Human-readable rationale (required for user-initiated corrections)
  rationale      text,

  -- Optional link to a provenance edge that captures this change structurally
  provenance_edge_id uuid,

  -- Immutable timestamp
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS: owner read, service-role write ──────────────────────────────────────
ALTER TABLE cognition_mutations ENABLE ROW LEVEL SECURITY;

-- Owners can read their own audit history
CREATE POLICY "owner_read" ON cognition_mutations
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT policy: server uses service role which bypasses RLS.
-- This enforces that mutations can only be written server-side,
-- not directly by the client via Supabase JS SDK.

-- No UPDATE or DELETE policies: append-only by design.
-- Truth-state history must be immutable.

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: all mutations for an artifact
CREATE INDEX IF NOT EXISTS cognition_mutations_artifact_idx
  ON cognition_mutations (user_id, artifact_type, artifact_id, created_at DESC);

-- Timeline view: all mutations for a user, newest first
CREATE INDEX IF NOT EXISTS cognition_mutations_timeline_idx
  ON cognition_mutations (user_id, created_at DESC);

-- Mutation type filtering (for correction authority queries)
CREATE INDEX IF NOT EXISTS cognition_mutations_type_idx
  ON cognition_mutations (user_id, mutation_type, created_at DESC);

-- ─── Export-safe view ─────────────────────────────────────────────────────────
-- Strips internal UUIDs for portable user data exports

CREATE OR REPLACE VIEW cognition_mutations_export AS
SELECT
  id,
  artifact_type,
  artifact_id,
  mutation_type,
  before_state,
  after_state,
  rationale,
  created_at
FROM cognition_mutations
WHERE auth.uid() = user_id;

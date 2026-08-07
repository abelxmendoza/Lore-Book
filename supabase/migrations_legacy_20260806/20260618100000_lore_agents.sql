-- =====================================================
-- LORE AGENTS — System Cognition / Agent Layer
--
-- A safe agent orchestration layer that runs AFTER the
-- loreInterpretationPipeline. Agents inspect the pipeline
-- result and PROPOSE actions. They never mutate core memory
-- directly — proposed actions are routed through the existing
-- confirmation / correction / cognition-mutation systems.
--
-- Tables:
--   lore_agent_runs             — one row per agent execution
--   lore_agent_observations     — what an agent noticed
--   lore_agent_proposed_actions — what an agent wants to do (proposal only)
--   system_knowledge            — LoreBook's self-model (global, not per-user)
--
-- Design invariants (mirrors cognition_mutations):
--   - Owner can only READ their own per-user rows
--   - No INSERT/UPDATE/DELETE policies on per-user tables:
--     all writes go through the service role (server-side only)
--   - system_knowledge is global self-model: readable by any
--     authenticated user, writable only by the service role
-- =====================================================

-- ─── lore_agent_runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lore_agent_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Correlation id shared by every agent in a single orchestration pass
  run_id        text        NOT NULL,
  agent_name    text        NOT NULL,

  -- Source context
  thread_id     text,
  message_id    uuid,

  -- Status: 'running' | 'completed' | 'failed' | 'skipped'
  status        text        NOT NULL DEFAULT 'completed',
  confidence    real,

  -- Timing
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  duration_ms   integer,

  -- Non-fatal issues surfaced by the agent
  warnings      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error         text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── lore_agent_observations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lore_agent_observations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  run_id        text        NOT NULL,
  agent_name    text        NOT NULL,

  kind          text        NOT NULL,   -- 'memory_candidate' | 'identity_collision' | ...
  summary       text        NOT NULL,
  evidence      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  confidence    real,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── lore_agent_proposed_actions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lore_agent_proposed_actions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  run_id        text        NOT NULL,
  agent_name    text        NOT NULL,

  -- 'propose_memory_mutation' | 'propose_entity_merge' | 'propose_alias'
  -- | 'propose_correction' | 'propose_narrative_update'
  action_type   text        NOT NULL,

  -- Lifecycle: 'proposed' | 'routed' | 'confirmed' | 'rejected' | 'expired'
  status        text        NOT NULL DEFAULT 'proposed',

  target_kind   text,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  confidence    real,
  requires_confirmation boolean NOT NULL DEFAULT true,

  -- Which existing confirmation system this should be routed to
  -- 'memory_review_queue' | 'entity_authority' | 'correction_authority' | 'none'
  routed_to     text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── system_knowledge (global self-model) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_knowledge (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept          text        NOT NULL,
  description      text        NOT NULL,
  source_file      text,
  route            text,
  service_name     text,
  schema_name      text,
  confidence       real        NOT NULL DEFAULT 1.0,
  last_verified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS: owner read, service-role write ──────────────────────────────────────
ALTER TABLE lore_agent_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lore_agent_observations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lore_agent_proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_knowledge            ENABLE ROW LEVEL SECURITY;

-- Owners can read their own agent history. No write policies:
-- the server writes via the service role (bypasses RLS), which keeps
-- agent output append-only and unreachable from the client SDK.
CREATE POLICY "owner_read" ON lore_agent_runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "owner_read" ON lore_agent_observations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "owner_read" ON lore_agent_proposed_actions
  FOR SELECT USING (auth.uid() = user_id);

-- system_knowledge is LoreBook's self-model: shared, not user-scoped.
-- Any authenticated user may read it; only the service role may write.
CREATE POLICY "authenticated_read" ON system_knowledge
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS lore_agent_runs_message_idx
  ON lore_agent_runs (user_id, message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lore_agent_runs_run_idx
  ON lore_agent_runs (user_id, run_id);

CREATE INDEX IF NOT EXISTS lore_agent_observations_run_idx
  ON lore_agent_observations (user_id, run_id);

CREATE INDEX IF NOT EXISTS lore_agent_proposed_actions_run_idx
  ON lore_agent_proposed_actions (user_id, run_id);

CREATE INDEX IF NOT EXISTS lore_agent_proposed_actions_status_idx
  ON lore_agent_proposed_actions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS system_knowledge_concept_idx
  ON system_knowledge (concept);

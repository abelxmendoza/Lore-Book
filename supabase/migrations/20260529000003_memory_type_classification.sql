-- Memory type classification
-- Distinguishes episodic memory (specific events) from semantic memory (general facts)
-- and procedural memory (skills/habits). Foundation for autobiographical memory architecture.

ALTER TABLE resolved_events
  ADD COLUMN IF NOT EXISTS memory_type text NOT NULL DEFAULT 'episodic';

ALTER TABLE omega_claims
  ADD COLUMN IF NOT EXISTS memory_type text NOT NULL DEFAULT 'semantic';

COMMENT ON COLUMN resolved_events.memory_type IS 'episodic=specific event; semantic=general fact; procedural=skill/habit';
COMMENT ON COLUMN omega_claims.memory_type IS 'semantic=general fact; episodic=event-specific claim; procedural=routine/skill';

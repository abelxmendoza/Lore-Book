-- The live romantic_relationships table was an old shape (person_name) that
-- doesn't match the detector code or the Love & Relationships view
-- (person_id/person_type). Table was empty — recreated with the canonical
-- columns from repo migration 20250126000043. See that file for the full
-- definition; this migration is the prod-applied DROP + CREATE.

-- (applied remotely 2026-06-11 via MCP; content mirrors 20250126000043's
-- romantic_relationships table + RLS)

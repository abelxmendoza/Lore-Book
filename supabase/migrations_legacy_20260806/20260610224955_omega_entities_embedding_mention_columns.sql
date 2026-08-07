-- omega_entities was missing three columns the entity resolution code writes:
-- embedding (semantic dedup), mention_count (importance growth), and
-- mention_status (promotion gating). Applied to production 2026-06-10 via MCP;
-- this file mirrors that migration so the repo matches the live schema.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.omega_entities
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS mention_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mention_status TEXT DEFAULT 'mentioned_only';

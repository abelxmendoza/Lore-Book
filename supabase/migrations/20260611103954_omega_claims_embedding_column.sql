-- omega_claims was missing the embedding column the claim-dedup code writes
-- (same drift family as omega_entities, fixed 2026-06-10).

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.omega_claims
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

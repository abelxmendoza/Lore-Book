-- =====================================================
-- ADD truth_state TO omega_claims
--
-- Tracks the epistemic status of each claim independently
-- of provenance edges. Enables contradiction resolution
-- (keep_newest → REVISED, preserve_both → CONTEXTUAL, etc.)
--
-- Mirrors the TruthState union in provenance/types.ts.
-- =====================================================

ALTER TABLE omega_claims
  ADD COLUMN IF NOT EXISTS truth_state TEXT
    CHECK (truth_state IN ('CANONICAL', 'CONTEXTUAL', 'REVISED', 'DISPUTED', 'INFERRED', 'PENDING_VERIFICATION'))
    DEFAULT 'CANONICAL';

-- Back-fill existing active claims as CANONICAL
UPDATE omega_claims
  SET truth_state = 'CANONICAL'
  WHERE truth_state IS NULL AND is_active = true;

-- Back-fill inactive claims as REVISED (superseded)
UPDATE omega_claims
  SET truth_state = 'REVISED'
  WHERE truth_state IS NULL AND is_active = false;

-- Index for filtering by truth state in RAG retrieval
CREATE INDEX IF NOT EXISTS idx_omega_claims_truth_state
  ON omega_claims (user_id, entity_id, truth_state)
  WHERE is_active = true;

COMMENT ON COLUMN omega_claims.truth_state IS
  'Epistemic status: CANONICAL | CONTEXTUAL | REVISED | DISPUTED | INFERRED | PENDING_VERIFICATION';

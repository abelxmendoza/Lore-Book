-- Add indexes for efficient fact queries (cost-optimized verification)
-- These indexes enable fast lookups without expensive scans

-- Index for looking up facts by entry (for caching)
CREATE INDEX IF NOT EXISTS fact_claims_entry_id_idx ON public.fact_claims(entry_id);

-- Index for looking up facts by subject and attribute (for contradiction detection)
CREATE INDEX IF NOT EXISTS fact_claims_subject_attribute_idx ON public.fact_claims(user_id, subject, attribute);

-- Index for looking up facts by user and entry (for verification)
CREATE INDEX IF NOT EXISTS fact_claims_user_entry_idx ON public.fact_claims(user_id, entry_id);

-- Composite index for fast fact lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS fact_claims_lookup_idx ON public.fact_claims(user_id, subject, attribute, value);

-- Index for entry verifications by status (for Truth Seeker panel)
CREATE INDEX IF NOT EXISTS entry_verifications_status_idx ON public.entry_verifications(user_id, verification_status, resolved);

-- Index for entry verifications by entry (for quick status lookup)
CREATE INDEX IF NOT EXISTS entry_verifications_entry_idx ON public.entry_verifications(entry_id);

-- Index for finding contradictions (unresolved, contradicted/ambiguous)
CREATE INDEX IF NOT EXISTS entry_verifications_contradictions_idx ON public.entry_verifications(user_id, verification_status) 
WHERE verification_status IN ('contradicted', 'ambiguous') AND resolved = false;

COMMENT ON INDEX fact_claims_entry_id_idx IS 'Fast lookup of facts for a specific entry (caching)';
COMMENT ON INDEX fact_claims_subject_attribute_idx IS 'Fast lookup of facts by subject+attribute (contradiction detection)';
COMMENT ON INDEX fact_claims_user_entry_idx IS 'Fast lookup of facts for user+entry (verification)';
COMMENT ON INDEX fact_claims_lookup_idx IS 'Fast exact fact lookup (most common query)';
COMMENT ON INDEX entry_verifications_status_idx IS 'Fast lookup of verifications by status (Truth Seeker panel)';
COMMENT ON INDEX entry_verifications_entry_idx IS 'Fast lookup of verification for entry';
COMMENT ON INDEX entry_verifications_contradictions_idx IS 'Partial index for finding unresolved contradictions (most efficient)';


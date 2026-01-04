-- =====================================================
-- OMEGA MEMORY ENGINE — ENHANCEMENTS
-- Semantic similarity, evidence scoring, temporal reasoning
-- =====================================================

-- Add embedding column to claims for semantic similarity
ALTER TABLE omega_claims 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add embedding column to entities for semantic matching
ALTER TABLE omega_entities 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add evidence scoring fields
ALTER TABLE omega_evidence 
ADD COLUMN IF NOT EXISTS reliability_score FLOAT DEFAULT 1.0 CHECK (reliability_score >= 0.0 AND reliability_score <= 1.0),
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'journal_entry' CHECK (source_type IN ('journal_entry', 'chat', 'external', 'user_verified', 'ai_inferred'));

-- Add temporal reasoning fields to claims
ALTER TABLE omega_claims
ADD COLUMN IF NOT EXISTS temporal_context JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS temporal_confidence FLOAT DEFAULT 0.8 CHECK (temporal_confidence >= 0.0 AND temporal_confidence <= 1.0);

-- Add semantic similarity index for fast conflict detection
CREATE INDEX IF NOT EXISTS idx_omega_claims_embedding ON omega_claims USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Add entity embedding index
CREATE INDEX IF NOT EXISTS idx_omega_entities_embedding ON omega_entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create view for evidence-weighted claims
CREATE OR REPLACE VIEW omega_claims_with_evidence AS
SELECT 
  c.*,
  COALESCE(
    SUM(e.reliability_score) / NULLIF(COUNT(e.id), 0),
    0.5
  ) as evidence_weighted_score,
  COUNT(e.id) as evidence_count
FROM omega_claims c
LEFT JOIN omega_evidence e ON e.claim_id = c.id
WHERE c.is_active = true
GROUP BY c.id;

-- Function to calculate temporal overlap
CREATE OR REPLACE FUNCTION temporal_overlap(
  start1 TIMESTAMPTZ,
  end1 TIMESTAMPTZ,
  start2 TIMESTAMPTZ,
  end2 TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
BEGIN
  -- If either claim has no end time, it's considered ongoing
  IF end1 IS NULL THEN
    RETURN start2 <= start1 OR (end2 IS NOT NULL AND end2 >= start1);
  END IF;
  IF end2 IS NULL THEN
    RETURN start1 <= start2 OR (end1 IS NOT NULL AND end1 >= start2);
  END IF;
  
  -- Both have end times - check for overlap
  RETURN (start1 <= end2 AND end1 >= start2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to detect temporal contradictions
CREATE OR REPLACE FUNCTION detect_temporal_contradiction(
  claim1_id UUID,
  claim2_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  claim1 RECORD;
  claim2 RECORD;
BEGIN
  SELECT * INTO claim1 FROM omega_claims WHERE id = claim1_id;
  SELECT * INTO claim2 FROM omega_claims WHERE id = claim2_id;
  
  -- If claims don't overlap temporally, no contradiction
  IF NOT temporal_overlap(
    claim1.start_time,
    claim1.end_time,
    claim2.start_time,
    claim2.end_time
  ) THEN
    RETURN false;
  END IF;
  
  -- If they overlap and are semantically opposite, it's a contradiction
  -- This will be checked in application code using embeddings
  RETURN true;
END;
$$ LANGUAGE plpgsql;


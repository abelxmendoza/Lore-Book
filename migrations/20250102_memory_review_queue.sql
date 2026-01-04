-- =====================================================
-- LORE-KEEPER MEMORY REVIEW QUEUE (MRQ)
-- Purpose: Allow memory ingestion to feel automatic while
-- preserving correctness, consent, and reversibility.
-- =====================================================

-- Memory Proposals: Proposed memories awaiting review
CREATE TABLE IF NOT EXISTS memory_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES omega_entities(id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    perspective_id UUID REFERENCES perspectives(id) ON DELETE SET NULL,
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    temporal_context JSONB DEFAULT '{}'::jsonb,
    source_excerpt TEXT,
    reasoning TEXT,
    affected_claim_ids UUID[] DEFAULT '{}',
    risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EDITED', 'DEFERRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Memory Decisions: User/system decisions on proposals
CREATE TABLE IF NOT EXISTS memory_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL REFERENCES memory_proposals(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT', 'EDIT', 'DEFER')),
    edited_text TEXT,
    edited_confidence FLOAT CHECK (edited_confidence >= 0.0 AND edited_confidence <= 1.0),
    decided_by TEXT NOT NULL CHECK (decided_by IN ('USER', 'SYSTEM')),
    reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_proposals_user_status ON memory_proposals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memory_proposals_risk_status ON memory_proposals(risk_level, status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_memory_proposals_entity ON memory_proposals(entity_id);
CREATE INDEX IF NOT EXISTS idx_memory_proposals_created ON memory_proposals(created_at DESC) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_memory_decisions_proposal ON memory_decisions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_memory_decisions_user ON memory_decisions(user_id);

-- Row Level Security
ALTER TABLE memory_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_decisions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memory_proposals
CREATE POLICY "Users can view their own memory proposals"
    ON memory_proposals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memory proposals"
    ON memory_proposals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memory proposals"
    ON memory_proposals FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for memory_decisions
CREATE POLICY "Users can view their own memory decisions"
    ON memory_decisions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memory decisions"
    ON memory_decisions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to get pending MRQ ordered by priority
CREATE OR REPLACE FUNCTION get_pending_mrq(user_id_param UUID)
RETURNS TABLE (
    id UUID,
    entity_id UUID,
    claim_text TEXT,
    perspective_id UUID,
    confidence FLOAT,
    risk_level TEXT,
    created_at TIMESTAMPTZ,
    reasoning TEXT,
    source_excerpt TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mp.id,
        mp.entity_id,
        mp.claim_text,
        mp.perspective_id,
        mp.confidence,
        mp.risk_level,
        mp.created_at,
        mp.reasoning,
        mp.source_excerpt
    FROM memory_proposals mp
    WHERE mp.user_id = user_id_param
      AND mp.status = 'PENDING'
    ORDER BY
        CASE mp.risk_level
            WHEN 'HIGH' THEN 1
            WHEN 'MEDIUM' THEN 2
            WHEN 'LOW' THEN 3
        END,
        mp.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


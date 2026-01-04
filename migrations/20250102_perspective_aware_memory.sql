-- =====================================================
-- LORE-KEEPER PERSPECTIVE-AWARE MEMORY LAYER
-- Purpose: Allow multiple viewpoints to coexist for the same
-- entity, claim, or event while preserving truth-seeking.
-- =====================================================

-- Perspectives: Different viewpoints on the same reality
CREATE TABLE IF NOT EXISTS perspectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'SELF',
        'OTHER_PERSON',
        'GROUP',
        'SYSTEM',
        'FICTIONAL',
        'HISTORICAL'
    )),
    owner_entity_id UUID REFERENCES omega_entities(id) ON DELETE SET NULL,
    label TEXT NOT NULL, -- e.g. "Abel (self)", "Coach Felipe", "System inference"
    reliability_modifier FLOAT NOT NULL DEFAULT 1.0 CHECK (reliability_modifier >= 0.0 AND reliability_modifier <= 2.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, label)
);

-- Perspective Claims: Claims from specific perspectives
CREATE TABLE IF NOT EXISTS perspective_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    base_claim_id UUID NOT NULL REFERENCES omega_claims(id) ON DELETE CASCADE,
    perspective_id UUID NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    sentiment TEXT CHECK (sentiment IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED')),
    temporal_context JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(base_claim_id, perspective_id, is_active) WHERE is_active = true
);

-- Perspective Disputes: Track disagreements between perspectives
CREATE TABLE IF NOT EXISTS perspective_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    base_claim_id UUID NOT NULL REFERENCES omega_claims(id) ON DELETE CASCADE,
    perspective_claim_a_id UUID NOT NULL REFERENCES perspective_claims(id) ON DELETE CASCADE,
    perspective_claim_b_id UUID NOT NULL REFERENCES perspective_claims(id) ON DELETE CASCADE,
    reason TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_perspectives_user_type ON perspectives(user_id, type);
CREATE INDEX IF NOT EXISTS idx_perspectives_owner_entity ON perspectives(owner_entity_id);
CREATE INDEX IF NOT EXISTS idx_perspective_claims_base ON perspective_claims(base_claim_id);
CREATE INDEX IF NOT EXISTS idx_perspective_claims_perspective ON perspective_claims(perspective_id);
CREATE INDEX IF NOT EXISTS idx_perspective_claims_active ON perspective_claims(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_perspective_claims_user ON perspective_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_perspective_disputes_base ON perspective_disputes(base_claim_id);
CREATE INDEX IF NOT EXISTS idx_perspective_disputes_resolved ON perspective_disputes(is_resolved) WHERE is_resolved = false;

-- Row Level Security
ALTER TABLE perspectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE perspective_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE perspective_disputes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for perspectives
CREATE POLICY "Users can view their own perspectives"
    ON perspectives FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own perspectives"
    ON perspectives FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own perspectives"
    ON perspectives FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own perspectives"
    ON perspectives FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for perspective_claims
CREATE POLICY "Users can view their own perspective claims"
    ON perspective_claims FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own perspective claims"
    ON perspective_claims FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own perspective claims"
    ON perspective_claims FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own perspective claims"
    ON perspective_claims FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for perspective_disputes
CREATE POLICY "Users can view their own perspective disputes"
    ON perspective_disputes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own perspective disputes"
    ON perspective_disputes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own perspective disputes"
    ON perspective_disputes FOR UPDATE
    USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_perspectives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_perspectives_updated_at
    BEFORE UPDATE ON perspectives
    FOR EACH ROW
    EXECUTE FUNCTION update_perspectives_updated_at();

-- Function to get perspective claims for a base claim
CREATE OR REPLACE FUNCTION get_perspective_claims_for_base(base_claim_id_param UUID)
RETURNS TABLE (
    id UUID,
    base_claim_id UUID,
    perspective_id UUID,
    perspective_label TEXT,
    perspective_type TEXT,
    text TEXT,
    confidence FLOAT,
    sentiment TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.base_claim_id,
        pc.perspective_id,
        p.label as perspective_label,
        p.type as perspective_type,
        pc.text,
        pc.confidence,
        pc.sentiment,
        pc.is_active,
        pc.created_at
    FROM perspective_claims pc
    JOIN perspectives p ON p.id = pc.perspective_id
    WHERE pc.base_claim_id = base_claim_id_param
    ORDER BY pc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


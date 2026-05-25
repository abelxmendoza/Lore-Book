-- =====================================================
-- OMEGA MEMORY ENGINE — DATABASE SCHEMA
-- Purpose: Time-aware, truth-seeking knowledge system
-- =====================================================

-- Entities: People, Characters, Locations, Organizations, Events
CREATE TABLE IF NOT EXISTS omega_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT')),
    primary_name TEXT NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, primary_name, type)
);

-- Claims: Statements about entities with temporal validity
CREATE TABLE IF NOT EXISTS omega_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES omega_entities(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('USER', 'AI', 'EXTERNAL')),
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    sentiment TEXT CHECK (sentiment IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Relationships: Connections between entities
CREATE TABLE IF NOT EXISTS omega_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_entity_id UUID NOT NULL REFERENCES omega_entities(id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES omega_entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- e.g. "coach_of", "rival_of", "located_at"
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, from_entity_id, to_entity_id, type)
);

-- Evidence: Supporting documentation for claims
CREATE TABLE IF NOT EXISTS omega_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES omega_claims(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_omega_entities_user_type ON omega_entities(user_id, type);
CREATE INDEX IF NOT EXISTS idx_omega_entities_aliases ON omega_entities USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_omega_claims_entity_active ON omega_claims(entity_id, is_active);
CREATE INDEX IF NOT EXISTS idx_omega_claims_user_entity ON omega_claims(user_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_omega_claims_time_range ON omega_claims(start_time, end_time) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_omega_relationships_from ON omega_relationships(from_entity_id, is_active);
CREATE INDEX IF NOT EXISTS idx_omega_relationships_to ON omega_relationships(to_entity_id, is_active);
CREATE INDEX IF NOT EXISTS idx_omega_relationships_user ON omega_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_omega_evidence_claim ON omega_evidence(claim_id);

-- Row Level Security
ALTER TABLE omega_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE omega_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE omega_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE omega_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own entities"
    ON omega_entities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own entities"
    ON omega_entities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entities"
    ON omega_entities FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own entities"
    ON omega_entities FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own claims"
    ON omega_claims FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own claims"
    ON omega_claims FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own claims"
    ON omega_claims FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own claims"
    ON omega_claims FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own relationships"
    ON omega_relationships FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own relationships"
    ON omega_relationships FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own relationships"
    ON omega_relationships FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own relationships"
    ON omega_relationships FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own evidence"
    ON omega_evidence FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own evidence"
    ON omega_evidence FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own evidence"
    ON omega_evidence FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own evidence"
    ON omega_evidence FOR DELETE
    USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_omega_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_omega_entities_updated_at
    BEFORE UPDATE ON omega_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_omega_updated_at();

CREATE TRIGGER update_omega_claims_updated_at
    BEFORE UPDATE ON omega_claims
    FOR EACH ROW
    EXECUTE FUNCTION update_omega_updated_at();

CREATE TRIGGER update_omega_relationships_updated_at
    BEFORE UPDATE ON omega_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_omega_updated_at();


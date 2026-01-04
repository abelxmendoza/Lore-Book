-- =====================================================
-- LORE-KEEPER INSIGHT & REFLECTION ENGINE (IRE)
-- Purpose: Surface meaningful, explainable patterns from
-- existing memory WITHOUT asserting new truth.
-- =====================================================

-- Insights: Observations about patterns in memory
CREATE TABLE IF NOT EXISTS insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'PATTERN',
        'TREND',
        'DIVERGENCE',
        'SHIFT',
        'RECURRING_THEME'
    )),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    scope TEXT NOT NULL CHECK (scope IN ('ENTITY', 'TIME', 'RELATIONSHIP', 'SELF')),
    related_entity_ids UUID[] DEFAULT '{}',
    related_claim_ids UUID[] DEFAULT '{}',
    related_perspective_ids UUID[] DEFAULT '{}',
    time_window JSONB DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Insight Evidence: Supporting claims for insights
CREATE TABLE IF NOT EXISTS insight_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES omega_claims(id) ON DELETE CASCADE,
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_insights_user_dismissed ON insights(user_id, dismissed) WHERE dismissed = false;
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_scope ON insights(scope);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_insights_generated ON insights(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_related_entities ON insights USING GIN(related_entity_ids);
CREATE INDEX IF NOT EXISTS idx_insights_related_claims ON insights USING GIN(related_claim_ids);
CREATE INDEX IF NOT EXISTS idx_insight_evidence_insight ON insight_evidence(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_evidence_claim ON insight_evidence(claim_id);

-- Row Level Security
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for insights
CREATE POLICY "Users can view their own insights"
    ON insights FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insights"
    ON insights FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
    ON insights FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for insight_evidence
CREATE POLICY "Users can view their own insight evidence"
    ON insight_evidence FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insight evidence"
    ON insight_evidence FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to get insights with evidence
CREATE OR REPLACE FUNCTION get_insight_with_evidence(insight_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    insight_record RECORD;
    evidence_records RECORD[];
    result JSONB;
BEGIN
    SELECT * INTO insight_record
    FROM insights
    WHERE id = insight_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT ARRAY_AGG(row_to_json(e)) INTO evidence_records
    FROM insight_evidence e
    WHERE e.insight_id = insight_id_param;

    result := jsonb_build_object(
        'insight', row_to_json(insight_record),
        'evidence', COALESCE(evidence_records, '[]'::jsonb),
        'disclaimer', 'This is an observation, not a fact.'
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


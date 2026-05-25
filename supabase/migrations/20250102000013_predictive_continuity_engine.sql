-- =====================================================
-- LORE-KEEPER PREDICTIVE CONTINUITY ENGINE (PCE)
-- Purpose: Surface probabilistic future trajectories
-- based on past patterns, decisions, and outcomes
-- WITHOUT asserting certainty or giving instructions.
-- =====================================================

-- Predictions: Probabilistic future trajectories
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    probability FLOAT NOT NULL CHECK (probability >= 0.0 AND probability <= 1.0),
    confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    prediction_type TEXT NOT NULL CHECK (prediction_type IN (
        'BEHAVIORAL',
        'RELATIONAL',
        'CAREER',
        'EMOTIONAL',
        'DECISION_OUTCOME',
        'PATTERN_CONTINUATION'
    )),
    scope TEXT NOT NULL CHECK (scope IN ('ENTITY', 'SELF', 'RELATIONSHIP', 'TIME')),
    related_entity_ids UUID[] DEFAULT '{}',
    related_decision_ids UUID[] DEFAULT '{}',
    related_insight_ids UUID[] DEFAULT '{}',
    related_claim_ids UUID[] DEFAULT '{}',
    time_horizon TEXT NOT NULL CHECK (time_horizon IN ('SHORT', 'MEDIUM', 'LONG')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Prediction Evidence: Evidence supporting predictions
CREATE TABLE IF NOT EXISTS prediction_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN (
        'DECISION_HISTORY',
        'OUTCOME_HISTORY',
        'INSIGHT_PATTERN',
        'TEMPORAL_TREND'
    )),
    reference_id UUID NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_dismissed ON predictions(user_id, dismissed);
CREATE INDEX IF NOT EXISTS idx_predictions_type ON predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_generated ON predictions(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_entity_ids ON predictions USING GIN(related_entity_ids);
CREATE INDEX IF NOT EXISTS idx_predictions_decision_ids ON predictions USING GIN(related_decision_ids);
CREATE INDEX IF NOT EXISTS idx_predictions_insight_ids ON predictions USING GIN(related_insight_ids);
CREATE INDEX IF NOT EXISTS idx_prediction_evidence_prediction ON prediction_evidence(prediction_id);
CREATE INDEX IF NOT EXISTS idx_prediction_evidence_source ON prediction_evidence(source_type, reference_id);

-- Row Level Security
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for predictions
CREATE POLICY "Users can view their own predictions"
    ON predictions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own predictions"
    ON predictions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own predictions"
    ON predictions FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for prediction_evidence
CREATE POLICY "Users can view their own prediction evidence"
    ON prediction_evidence FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prediction evidence"
    ON prediction_evidence FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to get prediction with evidence
CREATE OR REPLACE FUNCTION get_prediction_with_evidence(prediction_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    prediction_record RECORD;
    evidence_records RECORD[];
    result JSONB;
BEGIN
    SELECT * INTO prediction_record
    FROM predictions
    WHERE id = prediction_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT ARRAY_AGG(row_to_json(e)) INTO evidence_records
    FROM prediction_evidence e
    WHERE e.prediction_id = prediction_id_param
    ORDER BY e.created_at ASC;

    result := jsonb_build_object(
        'prediction', row_to_json(prediction_record),
        'evidence', COALESCE(evidence_records, '[]'::jsonb)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


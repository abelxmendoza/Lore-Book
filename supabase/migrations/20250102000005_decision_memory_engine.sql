-- =====================================================
-- LORE-KEEPER DECISION MEMORY ENGINE (DME)
-- Purpose: Capture WHY a decision was made at the time,
-- preserving context, values, uncertainty, and intent
-- WITHOUT judging outcomes or asserting correctness.
-- =====================================================

-- Decisions: Immutable snapshots of decisions
CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    decision_type TEXT NOT NULL CHECK (decision_type IN (
        'RELATIONSHIP',
        'CAREER',
        'HEALTH',
        'FINANCIAL',
        'CREATIVE',
        'SOCIAL',
        'PERSONAL',
        'OTHER'
    )),
    entity_ids UUID[] DEFAULT '{}',
    related_claim_ids UUID[] DEFAULT '{}',
    related_insight_ids UUID[] DEFAULT '{}',
    perspective_id UUID REFERENCES perspectives(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    uncertainty_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Decision Options: Options considered for each decision
CREATE TABLE IF NOT EXISTS decision_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    perceived_risks TEXT,
    perceived_rewards TEXT,
    confidence FLOAT CHECK (confidence >= 0.0 AND confidence <= 1.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Decision Rationale: Why the decision was made
CREATE TABLE IF NOT EXISTS decision_rationales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    reasoning TEXT NOT NULL,
    values_considered TEXT[] DEFAULT '{}',
    emotions_present TEXT[] DEFAULT '{}',
    constraints TEXT[] DEFAULT '{}',
    known_unknowns TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(decision_id)
);

-- Decision Outcomes: Outcomes linked post-hoc (never overwrite)
CREATE TABLE IF NOT EXISTS decision_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    outcome_text TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sentiment TEXT CHECK (sentiment IN ('POSITIVE', 'NEGATIVE', 'MIXED', 'UNCLEAR')),
    linked_claim_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_decisions_user_type ON decisions(user_id, decision_type);
CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_entity_ids ON decisions USING GIN(entity_ids);
CREATE INDEX IF NOT EXISTS idx_decisions_related_claims ON decisions USING GIN(related_claim_ids);
CREATE INDEX IF NOT EXISTS idx_decision_options_decision ON decision_options(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_rationales_decision ON decision_rationales(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_outcomes_decision ON decision_outcomes(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_outcomes_recorded ON decision_outcomes(recorded_at DESC);

-- Row Level Security
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_rationales ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for decisions
CREATE POLICY "Users can view their own decisions"
    ON decisions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decisions"
    ON decisions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decisions"
    ON decisions FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for decision_options
CREATE POLICY "Users can view their own decision options"
    ON decision_options FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decision options"
    ON decision_options FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decision options"
    ON decision_options FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for decision_rationales
CREATE POLICY "Users can view their own decision rationales"
    ON decision_rationales FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decision rationales"
    ON decision_rationales FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decision rationales"
    ON decision_rationales FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for decision_outcomes
CREATE POLICY "Users can view their own decision outcomes"
    ON decision_outcomes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decision outcomes"
    ON decision_outcomes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decision outcomes"
    ON decision_outcomes FOR UPDATE
    USING (auth.uid() = user_id);

-- Function to get decision with all related data
CREATE OR REPLACE FUNCTION get_decision_summary(decision_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    decision_record RECORD;
    options_records RECORD[];
    rationale_record RECORD;
    outcomes_records RECORD[];
    result JSONB;
BEGIN
    SELECT * INTO decision_record
    FROM decisions
    WHERE id = decision_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT ARRAY_AGG(row_to_json(o)) INTO options_records
    FROM decision_options o
    WHERE o.decision_id = decision_id_param;

    SELECT * INTO rationale_record
    FROM decision_rationales
    WHERE decision_id = decision_id_param;

    SELECT ARRAY_AGG(row_to_json(o)) INTO outcomes_records
    FROM decision_outcomes o
    WHERE o.decision_id = decision_id_param
    ORDER BY o.recorded_at DESC;

    result := jsonb_build_object(
        'decision', row_to_json(decision_record),
        'options', COALESCE(options_records, '[]'::jsonb),
        'rationale', COALESCE(row_to_json(rationale_record), 'null'::jsonb),
        'outcomes', COALESCE(outcomes_records, '[]'::jsonb)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


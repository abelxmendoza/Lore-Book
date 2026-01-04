-- =====================================================
-- LORE-KEEPER GOAL TRACKING & VALUE ALIGNMENT ENGINE (GVAE)
-- Purpose: Track stated values and goals over time and
-- surface alignment or drift WITHOUT moral judgment
-- or prescriptive advice.
-- =====================================================

-- Values: User-declared values
CREATE TABLE IF NOT EXISTS values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    priority FLOAT NOT NULL DEFAULT 0.5 CHECK (priority >= 0.0 AND priority <= 1.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Goals: User-declared goals
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    goal_type TEXT NOT NULL CHECK (goal_type IN (
        'PERSONAL',
        'CAREER',
        'RELATIONSHIP',
        'HEALTH',
        'FINANCIAL',
        'CREATIVE'
    )),
    related_value_ids UUID[] DEFAULT '{}',
    target_timeframe TEXT NOT NULL CHECK (target_timeframe IN ('SHORT', 'MEDIUM', 'LONG')),
    confidence FLOAT NOT NULL DEFAULT 0.6 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Goal Signals: Signals indicating goal alignment
CREATE TABLE IF NOT EXISTS goal_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN (
        'CLAIM',
        'DECISION',
        'INSIGHT',
        'OUTCOME'
    )),
    reference_id UUID NOT NULL,
    alignment_score FLOAT NOT NULL CHECK (alignment_score >= -1.0 AND alignment_score <= 1.0),
    explanation TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Alignment Snapshots: Aggregated alignment scores over time
CREATE TABLE IF NOT EXISTS alignment_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    alignment_score FLOAT NOT NULL CHECK (alignment_score >= -1.0 AND alignment_score <= 1.0),
    confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    time_window JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_values_user ON values(user_id);
CREATE INDEX IF NOT EXISTS idx_values_active ON values(user_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_goals_value_ids ON goals USING GIN(related_value_ids);
CREATE INDEX IF NOT EXISTS idx_goal_signals_goal ON goal_signals(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_signals_source ON goal_signals(source_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_goal_signals_recorded ON goal_signals(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alignment_snapshots_goal ON alignment_snapshots(goal_id);
CREATE INDEX IF NOT EXISTS idx_alignment_snapshots_generated ON alignment_snapshots(generated_at DESC);

-- Row Level Security
ALTER TABLE values ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for values
CREATE POLICY "Users can view their own values"
    ON values FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own values"
    ON values FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own values"
    ON values FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for goals
CREATE POLICY "Users can view their own goals"
    ON goals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals"
    ON goals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
    ON goals FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for goal_signals
CREATE POLICY "Users can view their own goal signals"
    ON goal_signals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goal signals"
    ON goal_signals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for alignment_snapshots
CREATE POLICY "Users can view their own alignment snapshots"
    ON alignment_snapshots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alignment snapshots"
    ON alignment_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to get goal with alignment
CREATE OR REPLACE FUNCTION get_goal_with_alignment(goal_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    goal_record RECORD;
    signals_records RECORD[];
    snapshots_records RECORD[];
    result JSONB;
BEGIN
    SELECT * INTO goal_record
    FROM goals
    WHERE id = goal_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT ARRAY_AGG(row_to_json(s)) INTO signals_records
    FROM goal_signals s
    WHERE s.goal_id = goal_id_param
    ORDER BY s.recorded_at DESC
    LIMIT 20;

    SELECT ARRAY_AGG(row_to_json(s)) INTO snapshots_records
    FROM alignment_snapshots s
    WHERE s.goal_id = goal_id_param
    ORDER BY s.generated_at DESC
    LIMIT 10;

    result := jsonb_build_object(
        'goal', row_to_json(goal_record),
        'signals', COALESCE(signals_records, '[]'::jsonb),
        'snapshots', COALESCE(snapshots_records, '[]'::jsonb)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


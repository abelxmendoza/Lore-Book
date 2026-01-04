-- =====================================================
-- LORE-KEEPER EXPLAINABILITY & META CONTINUITY LAYER
-- Purpose: Make every engine output auditable, reversible, and traceable
-- =====================================================

-- Continuity Events: Track all system actions
CREATE TABLE IF NOT EXISTS continuity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'CLAIM_CREATED',
        'CLAIM_UPDATED',
        'CLAIM_ENDED',
        'CLAIM_REJECTED',
        'ENTITY_RESOLVED',
        'ENTITY_MERGED',
        'CONTRADICTION_FOUND',
        'CONTINUITY_ALERT',
        'TIMELINE_SEGMENTED',
        'NARRATIVE_TRANSITION',
        'DECISION_RECORDED',
        'DECISION_OUTCOME_RECORDED'
    )),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    explanation TEXT NOT NULL,
    related_claim_ids UUID[] DEFAULT '{}',
    related_entity_ids UUID[] DEFAULT '{}',
    related_location_ids UUID[] DEFAULT '{}',
    initiated_by TEXT NOT NULL CHECK (initiated_by IN ('SYSTEM', 'USER', 'AI')),
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ALERT')),
    reversible BOOLEAN NOT NULL DEFAULT false,
    reversal_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Reversal Log: Track all reversals/undos
CREATE TABLE IF NOT EXISTS reversal_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES continuity_events(id) ON DELETE CASCADE,
    reversal_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    reversed_by TEXT NOT NULL CHECK (reversed_by IN ('USER', 'SYSTEM')),
    reason TEXT,
    snapshot_before JSONB NOT NULL,
    snapshot_after JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_continuity_events_user_timestamp ON continuity_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_events_type ON continuity_events(type);
CREATE INDEX IF NOT EXISTS idx_continuity_events_severity ON continuity_events(severity);
CREATE INDEX IF NOT EXISTS idx_continuity_events_reversible ON continuity_events(reversible) WHERE reversible = true;
CREATE INDEX IF NOT EXISTS idx_continuity_events_related_claims ON continuity_events USING GIN(related_claim_ids);
CREATE INDEX IF NOT EXISTS idx_continuity_events_related_entities ON continuity_events USING GIN(related_entity_ids);
CREATE INDEX IF NOT EXISTS idx_reversal_logs_event ON reversal_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_reversal_logs_user ON reversal_logs(user_id);

-- Row Level Security
ALTER TABLE continuity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reversal_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for continuity_events
CREATE POLICY "Users can view their own continuity events"
    ON continuity_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own continuity events"
    ON continuity_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own continuity events"
    ON continuity_events FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for reversal_logs
CREATE POLICY "Users can view their own reversal logs"
    ON reversal_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reversal logs"
    ON reversal_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to get event explanation with related context
CREATE OR REPLACE FUNCTION get_event_explanation(event_id_param UUID)
RETURNS JSONB AS $$
DECLARE
    event_record RECORD;
    result JSONB;
BEGIN
    SELECT * INTO event_record
    FROM continuity_events
    WHERE id = event_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    result := jsonb_build_object(
        'id', event_record.id,
        'timestamp', event_record.timestamp,
        'type', event_record.type,
        'explanation', event_record.explanation,
        'context', event_record.context,
        'reversible', event_record.reversible,
        'severity', event_record.severity,
        'initiated_by', event_record.initiated_by,
        'related_claim_ids', event_record.related_claim_ids,
        'related_entity_ids', event_record.related_entity_ids,
        'related_location_ids', event_record.related_location_ids
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if event can be reversed
CREATE OR REPLACE FUNCTION can_reverse_event(event_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    event_record RECORD;
BEGIN
    SELECT reversible, reversal_id INTO event_record
    FROM continuity_events
    WHERE id = event_id_param;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Can reverse if reversible and not already reversed
    RETURN event_record.reversible AND event_record.reversal_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


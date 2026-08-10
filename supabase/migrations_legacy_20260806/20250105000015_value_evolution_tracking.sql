-- =====================================================
-- VALUE EVOLUTION TRACKING
-- Purpose: Track how values and priorities evolve over time
-- =====================================================

-- Value Priority History: Track priority changes over time
CREATE TABLE IF NOT EXISTS value_priority_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value_id UUID NOT NULL REFERENCES values(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    priority FLOAT NOT NULL CHECK (priority >= 0.0 AND priority <= 1.0),
    rank INTEGER, -- Position in ranked list (1 = highest priority)
    reason TEXT, -- Why priority changed (e.g., "increased frequency in conversations")
    source TEXT DEFAULT 'automatic' CHECK (source IN ('automatic', 'user', 'extraction', 'evolution')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Value Evolution Events: Track significant value changes
CREATE TABLE IF NOT EXISTS value_evolution_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    value_id UUID REFERENCES values(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'value_created',
        'value_priority_increased',
        'value_priority_decreased',
        'value_rank_changed',
        'new_value_detected',
        'value_merged',
        'value_ended'
    )),
    old_priority FLOAT,
    new_priority FLOAT,
    old_rank INTEGER,
    new_rank INTEGER,
    description TEXT,
    evidence JSONB DEFAULT '{}'::jsonb, -- Quotes, conversation snippets, etc.
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Value Rankings: Snapshot of current value rankings
CREATE TABLE IF NOT EXISTS value_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    value_id UUID NOT NULL REFERENCES values(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL, -- 1 = highest priority
    score FLOAT NOT NULL, -- Calculated score based on frequency, recency, etc.
    frequency_score FLOAT DEFAULT 0.0, -- How often value appears in conversations
    recency_score FLOAT DEFAULT 0.0, -- How recently value was mentioned
    sentiment_score FLOAT DEFAULT 0.0, -- Sentiment when value is mentioned
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, value_id, calculated_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_value_priority_history_value ON value_priority_history(value_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_value_priority_history_user ON value_priority_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_value_evolution_events_user ON value_evolution_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_value_evolution_events_type ON value_evolution_events(user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_value_rankings_user ON value_rankings(user_id, calculated_at DESC, rank);
CREATE INDEX IF NOT EXISTS idx_value_rankings_value ON value_rankings(value_id, calculated_at DESC);


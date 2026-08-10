-- =====================================================
-- LORE-KEEPER CONVERSATIONAL ORCHESTRATION LAYER (COL)
-- Purpose: Make chatbot aware of memory, perspective,
-- insights, and uncertainty WITHOUT hallucination
-- or unauthorized memory mutation.
-- =====================================================

-- Chat Sessions: Track conversation sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, session_id)
);

-- Chat Context: Context for each chat session
CREATE TABLE IF NOT EXISTS chat_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    active_entity_ids UUID[] DEFAULT '{}',
    active_perspective_ids UUID[] DEFAULT '{}',
    unresolved_mrq_ids UUID[] DEFAULT '{}',
    recent_insight_ids UUID[] DEFAULT '{}',
    user_intent TEXT CHECK (user_intent IN (
        'REFLECTION',
        'QUESTION',
        'CLARIFICATION',
        'DECISION_SUPPORT',
        'MEMORY_REVIEW'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, session_id)
);

-- Chat Messages: Store chat messages with context
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    response_mode TEXT CHECK (response_mode IN (
        'FACTUAL_SUMMARY',
        'PERSPECTIVE_SUMMARY',
        'INSIGHT_REFLECTION',
        'UNCERTAINTY_NOTICE',
        'MRQ_PROMPT'
    )),
    citations UUID[] DEFAULT '{}', -- claim_ids that support this response
    confidence FLOAT CHECK (confidence >= 0.0 AND confidence <= 1.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_contexts_session ON chat_contexts(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_contexts_user ON chat_contexts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

-- Row Level Security
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_sessions
CREATE POLICY "Users can view their own chat sessions"
    ON chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat sessions"
    ON chat_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions"
    ON chat_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for chat_contexts
CREATE POLICY "Users can view their own chat contexts"
    ON chat_contexts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat contexts"
    ON chat_contexts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat contexts"
    ON chat_contexts FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for chat_messages
CREATE POLICY "Users can view their own chat messages"
    ON chat_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages"
    ON chat_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_updated_at();

CREATE TRIGGER update_chat_contexts_updated_at
    BEFORE UPDATE ON chat_contexts
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_updated_at();


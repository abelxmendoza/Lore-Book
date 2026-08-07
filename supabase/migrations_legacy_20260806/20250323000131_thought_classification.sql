-- Thought Classification and Insecurity Tracking System
-- Handles passing thoughts with appropriate response postures

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Thought Classification
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.thought_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  message_id TEXT, -- For chat messages
  thought_text TEXT NOT NULL,
  thought_type TEXT NOT NULL CHECK (thought_type IN (
    'passing_thought',
    'insecurity',
    'belief',
    'emotion_spike',
    'decision_probe',
    'memory_ping',
    'mixed'
  )),
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}', -- Additional classification details
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entry_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_thought_classifications_user ON public.thought_classifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thought_classifications_type ON public.thought_classifications(user_id, thought_type);
CREATE INDEX IF NOT EXISTS idx_thought_classifications_entry ON public.thought_classifications(entry_id);

-- ============================================================================
-- Insecurity Graph
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insecurity_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL, -- e.g., "career comparison", "money milestone", "age timeline"
  domain TEXT, -- 'career', 'money', 'age', 'relationships', 'status', 'health'
  frequency INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  intensity_trend TEXT CHECK (intensity_trend IN ('increasing', 'decreasing', 'stable', 'volatile')),
  average_intensity FLOAT DEFAULT 0.5,
  related_themes TEXT[] DEFAULT '{}',
  context_patterns JSONB DEFAULT '{}', -- When this insecurity appears
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, theme)
);

CREATE INDEX IF NOT EXISTS idx_insecurity_patterns_user ON public.insecurity_patterns(user_id, frequency DESC);
CREATE INDEX IF NOT EXISTS idx_insecurity_patterns_domain ON public.insecurity_patterns(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_insecurity_patterns_theme ON public.insecurity_patterns(user_id, theme);

-- ============================================================================
-- Insecurity Instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insecurity_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id UUID REFERENCES insecurity_patterns(id) ON DELETE CASCADE,
  thought_id UUID REFERENCES thought_classifications(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  intensity FLOAT CHECK (intensity >= 0 AND intensity <= 1),
  context TEXT, -- What triggered it
  comparison_target TEXT, -- "behind who" - extracted from thought
  domain TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insecurity_instances_user ON public.insecurity_instances(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insecurity_instances_pattern ON public.insecurity_instances(pattern_id);
CREATE INDEX IF NOT EXISTS idx_insecurity_instances_thought ON public.insecurity_instances(thought_id);

-- ============================================================================
-- Response Postures
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.thought_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thought_id UUID REFERENCES thought_classifications(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  response_posture TEXT NOT NULL CHECK (response_posture IN (
    'reflect',
    'clarify',
    'stabilize',
    'reframe'
  )),
  response_text TEXT NOT NULL,
  was_helpful BOOLEAN, -- User feedback
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thought_responses_user ON public.thought_responses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thought_responses_thought ON public.thought_responses(thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_responses_posture ON public.thought_responses(user_id, response_posture);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.thought_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insecurity_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insecurity_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insecurity_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thought_responses ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own thought classifications" ON public.thought_classifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own thought classifications" ON public.thought_classifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own thought classifications" ON public.thought_classifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own insecurity patterns" ON public.insecurity_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own insecurity patterns" ON public.insecurity_patterns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own insecurity patterns" ON public.insecurity_patterns FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own insecurity instances" ON public.insecurity_instances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own insecurity instances" ON public.insecurity_instances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own insecurity instances" ON public.insecurity_instances FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own thought responses" ON public.thought_responses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own thought responses" ON public.thought_responses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own thought responses" ON public.thought_responses FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.thought_classifications IS 'Classifies passing thoughts by type (passing_thought, insecurity, belief, etc.)';
COMMENT ON TABLE public.insecurity_patterns IS 'Tracks recurring insecurity themes and their patterns';
COMMENT ON TABLE public.insecurity_instances IS 'Individual instances of insecurities linked to thoughts';
COMMENT ON TABLE public.thought_responses IS 'Stores AI responses to thoughts with posture (reflect, clarify, stabilize, reframe)';

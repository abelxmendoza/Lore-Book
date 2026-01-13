-- Reinforcement Learning System Schema
-- Stores RL policies, experiences, and chat contexts for persona selection

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- RL Policies Table
-- Stores learned policies per user and context type
CREATE TABLE IF NOT EXISTS public.rl_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL, -- 'chat_persona', 'recommendation', etc.
  policy_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, context_type)
);

-- RL Experiences Table (for training and analysis)
CREATE TABLE IF NOT EXISTS public.rl_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL,
  context_features JSONB NOT NULL,
  action_taken JSONB NOT NULL,
  reward FLOAT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- RL Chat Contexts Table
-- Stores chat context when message is generated (for later reward updates)
CREATE TABLE IF NOT EXISTS public.rl_chat_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  session_id UUID,
  context_features JSONB NOT NULL,
  selected_persona TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RL Rewards Table (track reward signals)
CREATE TABLE IF NOT EXISTS public.rl_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experience_id UUID REFERENCES public.rl_experiences(id),
  reward_type TEXT NOT NULL, -- 'immediate', 'delayed', 'implicit'
  reward_value FLOAT NOT NULL,
  source TEXT, -- 'click', 'engagement', 'completion', 'feedback'
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_rl_policies_user_context 
  ON public.rl_policies(user_id, context_type);

CREATE INDEX IF NOT EXISTS idx_rl_experiences_user_time 
  ON public.rl_experiences(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rl_experiences_context_type 
  ON public.rl_experiences(user_id, context_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rl_rewards_experience 
  ON public.rl_rewards(experience_id);

CREATE INDEX IF NOT EXISTS idx_rl_rewards_user_time 
  ON public.rl_rewards(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rl_chat_contexts_user_message 
  ON public.rl_chat_contexts(user_id, message_id);

CREATE INDEX IF NOT EXISTS idx_rl_chat_contexts_user_session 
  ON public.rl_chat_contexts(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_rl_chat_contexts_created 
  ON public.rl_chat_contexts(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.rl_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rl_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rl_chat_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rl_rewards ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see their own RL data
CREATE POLICY "Users can view own RL policies"
  ON public.rl_policies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own RL policies"
  ON public.rl_policies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own RL policies"
  ON public.rl_policies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own RL experiences"
  ON public.rl_experiences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own RL experiences"
  ON public.rl_experiences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own RL chat contexts"
  ON public.rl_chat_contexts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own RL chat contexts"
  ON public.rl_chat_contexts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own RL rewards"
  ON public.rl_rewards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own RL rewards"
  ON public.rl_rewards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE public.rl_policies IS 'Stores learned RL policies per user and context type (e.g., chat persona selection)';
COMMENT ON TABLE public.rl_experiences IS 'Stores RL experiences (state, action, reward) for analysis and potential retraining';
COMMENT ON TABLE public.rl_chat_contexts IS 'Stores chat context when message is generated, needed for later reward updates';
COMMENT ON TABLE public.rl_rewards IS 'Tracks reward signals from various sources (feedback, engagement, etc.)';

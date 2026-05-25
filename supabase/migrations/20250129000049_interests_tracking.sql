-- =====================================================
-- INTERESTS TRACKING SYSTEM
-- Purpose: Track interests, calculate interest levels, manage scope
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Interests Table
CREATE TABLE IF NOT EXISTS public.interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Interest identification
  interest_name TEXT NOT NULL,
  interest_category TEXT, -- e.g., 'hobby', 'career', 'entertainment', 'learning', 'social', 'creative', 'physical', 'intellectual', 'other'
  
  -- Interest level calculation
  interest_level FLOAT DEFAULT 0.5 CHECK (interest_level >= 0 AND interest_level <= 1),
  
  -- Metrics for calculation
  mention_count INTEGER DEFAULT 1,
  emotional_intensity_avg FLOAT DEFAULT 0.5 CHECK (emotional_intensity_avg >= 0 AND emotional_intensity_avg <= 1),
  behavioral_impact_score FLOAT DEFAULT 0.0 CHECK (behavioral_impact_score >= 0 AND behavioral_impact_score <= 1),
  influence_score FLOAT DEFAULT 0.0 CHECK (influence_score >= 0 AND influence_score <= 1),
  knowledge_depth_score FLOAT DEFAULT 0.0 CHECK (knowledge_depth_score >= 0 AND knowledge_depth_score <= 1),
  time_investment_hours FLOAT DEFAULT 0.0 CHECK (time_investment_hours >= 0),
  
  -- Trends
  trend TEXT CHECK (trend IN ('growing', 'stable', 'declining', 'new')),
  trend_confidence FLOAT DEFAULT 0.5 CHECK (trend_confidence >= 0 AND trend_confidence <= 1),
  
  -- Timeline
  first_mentioned_at TIMESTAMPTZ NOT NULL,
  last_mentioned_at TIMESTAMPTZ NOT NULL,
  peak_interest_at TIMESTAMPTZ,
  
  -- Context
  related_character_ids UUID[] DEFAULT '{}',
  related_location_ids UUID[] DEFAULT '{}',
  related_event_ids UUID[] DEFAULT '{}',
  related_skill_ids UUID[] DEFAULT '{}',
  
  -- Evidence
  evidence_quotes TEXT[] DEFAULT '{}', -- Quotes showing interest
  source_entry_ids UUID[] DEFAULT '{}',
  
  -- Metadata
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one interest per user (normalized name)
  UNIQUE(user_id, interest_name)
);

-- Interest Mentions Table (for tracking individual mentions)
CREATE TABLE IF NOT EXISTS public.interest_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES public.interests(id) ON DELETE CASCADE,
  
  -- Mention details
  source_entry_id UUID REFERENCES public.journal_entries(id),
  source_message_id UUID REFERENCES public.chat_messages(id),
  mention_text TEXT NOT NULL,
  
  -- Metrics for this mention
  emotional_intensity FLOAT DEFAULT 0.5 CHECK (emotional_intensity >= 0 AND emotional_intensity <= 1),
  sentiment FLOAT DEFAULT 0.0 CHECK (sentiment >= -1 AND sentiment <= 1),
  word_count INTEGER,
  time_spent_minutes FLOAT CHECK (time_spent_minutes >= 0),
  
  -- Context
  mentioned_with_people UUID[] DEFAULT '{}',
  mentioned_at_location UUID REFERENCES public.locations(id),
  related_events UUID[] DEFAULT '{}',
  
  -- Behavioral indicators
  action_taken BOOLEAN DEFAULT FALSE,
  action_type TEXT, -- 'purchase', 'research', 'join', 'learn', 'create', 'share', 'discuss'
  influence_on_decision BOOLEAN DEFAULT FALSE,
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interest Scopes Table (similar to entity_scopes)
CREATE TABLE IF NOT EXISTS public.interest_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES public.interests(id) ON DELETE CASCADE,
  scope TEXT NOT NULL, -- e.g., 'career', 'hobby', 'social', 'learning', 'entertainment'
  scope_context TEXT, -- Additional context about the scope
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, interest_id, scope, scope_context)
);

-- Interest Scope Groups (similar to entity_scope_groups)
CREATE TABLE IF NOT EXISTS public.interest_scope_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  scope_context TEXT,
  interest_ids UUID[] DEFAULT '{}', -- Array of interest IDs in this scope group
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scope, scope_context)
);

-- Indexes for interests
CREATE INDEX IF NOT EXISTS interests_user_id_idx ON public.interests(user_id);
CREATE INDEX IF NOT EXISTS interests_interest_name_idx ON public.interests(user_id, interest_name);
CREATE INDEX IF NOT EXISTS interests_interest_level_idx ON public.interests(user_id, interest_level DESC);
CREATE INDEX IF NOT EXISTS interests_category_idx ON public.interests(user_id, interest_category);
CREATE INDEX IF NOT EXISTS interests_trend_idx ON public.interests(user_id, trend);
CREATE INDEX IF NOT EXISTS interests_last_mentioned_idx ON public.interests(user_id, last_mentioned_at DESC);

-- Indexes for interest_mentions
CREATE INDEX IF NOT EXISTS interest_mentions_user_id_idx ON public.interest_mentions(user_id);
CREATE INDEX IF NOT EXISTS interest_mentions_interest_id_idx ON public.interest_mentions(interest_id);
CREATE INDEX IF NOT EXISTS interest_mentions_created_at_idx ON public.interest_mentions(created_at DESC);
CREATE INDEX IF NOT EXISTS interest_mentions_source_entry_idx ON public.interest_mentions(source_entry_id);
CREATE INDEX IF NOT EXISTS interest_mentions_source_message_idx ON public.interest_mentions(source_message_id);

-- Indexes for interest_scopes
CREATE INDEX IF NOT EXISTS interest_scopes_user_id_idx ON public.interest_scopes(user_id);
CREATE INDEX IF NOT EXISTS interest_scopes_interest_id_idx ON public.interest_scopes(interest_id);
CREATE INDEX IF NOT EXISTS interest_scopes_scope_idx ON public.interest_scopes(user_id, scope);

-- Indexes for interest_scope_groups
CREATE INDEX IF NOT EXISTS interest_scope_groups_user_id_idx ON public.interest_scope_groups(user_id);
CREATE INDEX IF NOT EXISTS interest_scope_groups_scope_idx ON public.interest_scope_groups(user_id, scope);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_interests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for interests
CREATE TRIGGER interests_updated_at
  BEFORE UPDATE ON public.interests
  FOR EACH ROW
  EXECUTE FUNCTION update_interests_updated_at();

-- Trigger for interest_scopes
CREATE TRIGGER interest_scopes_updated_at
  BEFORE UPDATE ON public.interest_scopes
  FOR EACH ROW
  EXECUTE FUNCTION update_interests_updated_at();

-- Trigger for interest_scope_groups
CREATE TRIGGER interest_scope_groups_updated_at
  BEFORE UPDATE ON public.interest_scope_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_interests_updated_at();

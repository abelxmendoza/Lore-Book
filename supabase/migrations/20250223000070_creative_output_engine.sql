-- Creative Output Engine Schema
-- Stores creative events, flow states, blocks, inspiration, and project lifecycles

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Creative Events Table
-- Stores creative events from journal entries
CREATE TABLE IF NOT EXISTS public.creative_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  medium TEXT NOT NULL CHECK (medium IN (
    'coding', 'art', 'music', 'writing', 'video', 'robotics', 'design', 'performance', 'unknown'
  )),
  action TEXT NOT NULL CHECK (action IN (
    'created', 'worked_on', 'planned', 'published', 'thought_about', 'abandoned', 'completed'
  )),
  description TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flow States Table
-- Stores flow state detections
CREATE TABLE IF NOT EXISTS public.flow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  level FLOAT NOT NULL CHECK (level >= 0 AND level <= 1),
  indicators TEXT[] NOT NULL,
  medium TEXT CHECK (medium IN (
    'coding', 'art', 'music', 'writing', 'video', 'robotics', 'design', 'performance', 'unknown'
  )),
  duration_minutes INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Creative Blocks Table
-- Stores creative block detections
CREATE TABLE IF NOT EXISTS public.creative_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'emotional', 'perfectionism', 'overwhelm', 'lack_of_clarity', 'time', 'identity',
    'motivation', 'technical', 'other'
  )),
  evidence TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  medium TEXT CHECK (medium IN (
    'coding', 'art', 'music', 'writing', 'video', 'robotics', 'design', 'performance', 'unknown'
  )),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inspiration Sources Table
-- Stores inspiration source detections
CREATE TABLE IF NOT EXISTS public.inspiration_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'person', 'emotion', 'environment', 'media', 'experience', 'idea', 'nature', 'other'
  )),
  evidence TEXT NOT NULL,
  weight FLOAT NOT NULL CHECK (weight >= 0 AND weight <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Lifecycles Table
-- Stores project lifecycle tracking
CREATE TABLE IF NOT EXISTS public.project_lifecycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (
    'seed', 'development', 'execution', 'refinement', 'release', 'dormant', 'abandoned'
  )),
  indicators TEXT[] NOT NULL,
  first_mentioned TIMESTAMPTZ,
  last_updated TIMESTAMPTZ,
  event_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Creative Scores Table
-- Stores creative health scores
CREATE TABLE IF NOT EXISTS public.creative_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  output FLOAT NOT NULL CHECK (output >= 0 AND output <= 1),
  consistency FLOAT NOT NULL CHECK (consistency >= 0 AND consistency <= 1),
  flow FLOAT NOT NULL CHECK (flow >= 0 AND flow <= 1),
  inspiration FLOAT NOT NULL CHECK (inspiration >= 0 AND inspiration <= 1),
  overall FLOAT NOT NULL CHECK (overall >= 0 AND overall <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Creative Insights Table
-- Stores creative insights
CREATE TABLE IF NOT EXISTS public.creative_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'creative_event_detected', 'flow_state_detected', 'creative_block_detected',
    'inspiration_source', 'cycle_detected', 'project_stage_change', 'output_increase',
    'output_decrease', 'medium_shift'
  )),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  medium TEXT CHECK (medium IN (
    'coding', 'art', 'music', 'writing', 'video', 'robotics', 'design', 'performance', 'unknown'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_creative_events_user_medium ON public.creative_events(user_id, medium);
CREATE INDEX IF NOT EXISTS idx_creative_events_user_timestamp ON public.creative_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_creative_events_user_action ON public.creative_events(user_id, action);
CREATE INDEX IF NOT EXISTS idx_flow_states_user_timestamp ON public.flow_states(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flow_states_user_medium ON public.flow_states(user_id, medium);
CREATE INDEX IF NOT EXISTS idx_creative_blocks_user_type ON public.creative_blocks(user_id, type);
CREATE INDEX IF NOT EXISTS idx_creative_blocks_user_resolved ON public.creative_blocks(user_id, resolved);
CREATE INDEX IF NOT EXISTS idx_creative_blocks_timestamp ON public.creative_blocks(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inspiration_sources_user_type ON public.inspiration_sources(user_id, type);
CREATE INDEX IF NOT EXISTS idx_inspiration_sources_timestamp ON public.inspiration_sources(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_project_lifecycles_user_stage ON public.project_lifecycles(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_project_lifecycles_user_name ON public.project_lifecycles(user_id, project_name);
CREATE INDEX IF NOT EXISTS idx_creative_scores_user_timestamp ON public.creative_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_creative_insights_user_type ON public.creative_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_creative_insights_timestamp ON public.creative_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.creative_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_lifecycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own creative events
CREATE POLICY "Users can view own creative events"
  ON public.creative_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own creative events (via service)
CREATE POLICY "Users can insert own creative events"
  ON public.creative_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own creative events
CREATE POLICY "Users can update own creative events"
  ON public.creative_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own creative events
CREATE POLICY "Users can delete own creative events"
  ON public.creative_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own flow states
CREATE POLICY "Users can view own flow states"
  ON public.flow_states
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own flow states (via service)
CREATE POLICY "Users can insert own flow states"
  ON public.flow_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own flow states
CREATE POLICY "Users can update own flow states"
  ON public.flow_states
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own flow states
CREATE POLICY "Users can delete own flow states"
  ON public.flow_states
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own creative blocks
CREATE POLICY "Users can view own creative blocks"
  ON public.creative_blocks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own creative blocks (via service)
CREATE POLICY "Users can insert own creative blocks"
  ON public.creative_blocks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own creative blocks
CREATE POLICY "Users can update own creative blocks"
  ON public.creative_blocks
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own creative blocks
CREATE POLICY "Users can delete own creative blocks"
  ON public.creative_blocks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own inspiration sources
CREATE POLICY "Users can view own inspiration sources"
  ON public.inspiration_sources
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own inspiration sources (via service)
CREATE POLICY "Users can insert own inspiration sources"
  ON public.inspiration_sources
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own inspiration sources
CREATE POLICY "Users can update own inspiration sources"
  ON public.inspiration_sources
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own inspiration sources
CREATE POLICY "Users can delete own inspiration sources"
  ON public.inspiration_sources
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own project lifecycles
CREATE POLICY "Users can view own project lifecycles"
  ON public.project_lifecycles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own project lifecycles (via service)
CREATE POLICY "Users can insert own project lifecycles"
  ON public.project_lifecycles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own project lifecycles
CREATE POLICY "Users can update own project lifecycles"
  ON public.project_lifecycles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own project lifecycles
CREATE POLICY "Users can delete own project lifecycles"
  ON public.project_lifecycles
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own creative scores
CREATE POLICY "Users can view own creative scores"
  ON public.creative_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own creative scores (via service)
CREATE POLICY "Users can insert own creative scores"
  ON public.creative_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own creative scores
CREATE POLICY "Users can update own creative scores"
  ON public.creative_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own creative scores
CREATE POLICY "Users can delete own creative scores"
  ON public.creative_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own creative insights
CREATE POLICY "Users can view own creative insights"
  ON public.creative_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own creative insights (via service)
CREATE POLICY "Users can insert own creative insights"
  ON public.creative_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own creative insights
CREATE POLICY "Users can update own creative insights"
  ON public.creative_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own creative insights
CREATE POLICY "Users can delete own creative insights"
  ON public.creative_insights
  FOR DELETE
  USING (auth.uid() = user_id);


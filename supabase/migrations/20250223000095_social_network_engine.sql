-- Social Network Engine Schema
-- Stores social network nodes, edges, communities, influence, toxicity, drift, and network scores

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Social Nodes Table
-- Stores people/entities in the social network
CREATE TABLE IF NOT EXISTS public.social_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  mentions INT DEFAULT 0,
  sentiment FLOAT DEFAULT 0 CHECK (sentiment >= -1 AND sentiment <= 1),
  categories TEXT[] DEFAULT '{}',
  first_mentioned TIMESTAMPTZ,
  last_mentioned TIMESTAMPTZ,
  centrality FLOAT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person_name)
);

-- Social Edges Table
-- Stores relationships between people
CREATE TABLE IF NOT EXISTS public.social_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  weight INT DEFAULT 1,
  sentiment FLOAT DEFAULT 0 CHECK (sentiment >= -1 AND sentiment <= 1),
  interactions TEXT[] DEFAULT '{}',
  first_interaction TIMESTAMPTZ,
  last_interaction TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source, target)
);

-- Communities Table
-- Stores detected social communities
CREATE TABLE IF NOT EXISTS public.social_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL,
  members TEXT[] NOT NULL,
  theme TEXT NOT NULL,
  cohesion FLOAT DEFAULT 0 CHECK (cohesion >= 0 AND cohesion <= 1),
  size INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, community_id)
);

-- Influence Scores Table
-- Stores influence rankings
CREATE TABLE IF NOT EXISTS public.influence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),
  factors TEXT[] DEFAULT '{}',
  rank INT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person, timestamp)
);

-- Toxicity Signals Table
-- Stores toxic relationship detections
CREATE TABLE IF NOT EXISTS public.toxicity_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  evidence TEXT NOT NULL,
  severity FLOAT NOT NULL CHECK (severity >= 0 AND severity <= 1),
  category TEXT CHECK (category IN ('emotional', 'behavioral', 'social', 'other')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drift Events Table
-- Stores relationship drift detections
CREATE TABLE IF NOT EXISTS public.drift_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  trend TEXT NOT NULL CHECK (trend IN ('growing', 'fading', 'unstable', 'stable')),
  evidence TEXT[] DEFAULT '{}',
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Network Scores Table
-- Stores overall network health scores
CREATE TABLE IF NOT EXISTS public.network_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  cohesion FLOAT NOT NULL CHECK (cohesion >= 0 AND cohesion <= 1),
  stability FLOAT NOT NULL CHECK (stability >= 0 AND stability <= 1),
  influence_balance FLOAT NOT NULL CHECK (influence_balance >= 0 AND influence_balance <= 1),
  toxicity_level FLOAT NOT NULL CHECK (toxicity_level >= 0 AND toxicity_level <= 1),
  overall FLOAT NOT NULL CHECK (overall >= 0 AND overall <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social Insights Table
-- Stores social network insights
CREATE TABLE IF NOT EXISTS public.social_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'relationship_detected', 'influence_identified', 'community_detected',
    'toxicity_detected', 'drift_detected', 'centrality_identified',
    'network_health', 'relationship_strength', 'social_pattern'
  )),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  person TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_social_nodes_user ON public.social_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_social_nodes_person ON public.social_nodes(user_id, person_name);
CREATE INDEX IF NOT EXISTS idx_social_edges_user ON public.social_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_social_edges_source_target ON public.social_edges(user_id, source, target);
CREATE INDEX IF NOT EXISTS idx_social_communities_user ON public.social_communities(user_id);
CREATE INDEX IF NOT EXISTS idx_influence_scores_user_person ON public.influence_scores(user_id, person);
CREATE INDEX IF NOT EXISTS idx_influence_scores_timestamp ON public.influence_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_toxicity_signals_user_person ON public.toxicity_signals(user_id, person);
CREATE INDEX IF NOT EXISTS idx_toxicity_signals_timestamp ON public.toxicity_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_drift_events_user_person ON public.drift_events(user_id, person);
CREATE INDEX IF NOT EXISTS idx_drift_events_trend ON public.drift_events(user_id, trend);
CREATE INDEX IF NOT EXISTS idx_network_scores_user_timestamp ON public.network_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_insights_user_type ON public.social_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_social_insights_timestamp ON public.social_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.social_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influence_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toxicity_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drift_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own social nodes
CREATE POLICY "Users can view own social nodes"
  ON public.social_nodes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own social nodes (via service)
CREATE POLICY "Users can insert own social nodes"
  ON public.social_nodes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own social nodes
CREATE POLICY "Users can update own social nodes"
  ON public.social_nodes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own social nodes
CREATE POLICY "Users can delete own social nodes"
  ON public.social_nodes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own social edges
CREATE POLICY "Users can view own social edges"
  ON public.social_edges
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own social edges (via service)
CREATE POLICY "Users can insert own social edges"
  ON public.social_edges
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own social edges
CREATE POLICY "Users can update own social edges"
  ON public.social_edges
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own social edges
CREATE POLICY "Users can delete own social edges"
  ON public.social_edges
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own communities
CREATE POLICY "Users can view own communities"
  ON public.social_communities
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own communities (via service)
CREATE POLICY "Users can insert own communities"
  ON public.social_communities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own communities
CREATE POLICY "Users can update own communities"
  ON public.social_communities
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own communities
CREATE POLICY "Users can delete own communities"
  ON public.social_communities
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own influence scores
CREATE POLICY "Users can view own influence scores"
  ON public.influence_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own influence scores (via service)
CREATE POLICY "Users can insert own influence scores"
  ON public.influence_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own influence scores
CREATE POLICY "Users can update own influence scores"
  ON public.influence_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own influence scores
CREATE POLICY "Users can delete own influence scores"
  ON public.influence_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own toxicity signals
CREATE POLICY "Users can view own toxicity signals"
  ON public.toxicity_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own toxicity signals (via service)
CREATE POLICY "Users can insert own toxicity signals"
  ON public.toxicity_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own toxicity signals
CREATE POLICY "Users can update own toxicity signals"
  ON public.toxicity_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own toxicity signals
CREATE POLICY "Users can delete own toxicity signals"
  ON public.toxicity_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own drift events
CREATE POLICY "Users can view own drift events"
  ON public.drift_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own drift events (via service)
CREATE POLICY "Users can insert own drift events"
  ON public.drift_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own drift events
CREATE POLICY "Users can update own drift events"
  ON public.drift_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own drift events
CREATE POLICY "Users can delete own drift events"
  ON public.drift_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own network scores
CREATE POLICY "Users can view own network scores"
  ON public.network_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own network scores (via service)
CREATE POLICY "Users can insert own network scores"
  ON public.network_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own network scores
CREATE POLICY "Users can update own network scores"
  ON public.network_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own network scores
CREATE POLICY "Users can delete own network scores"
  ON public.network_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own social insights
CREATE POLICY "Users can view own social insights"
  ON public.social_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own social insights (via service)
CREATE POLICY "Users can insert own social insights"
  ON public.social_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own social insights
CREATE POLICY "Users can update own social insights"
  ON public.social_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own social insights
CREATE POLICY "Users can delete own social insights"
  ON public.social_insights
  FOR DELETE
  USING (auth.uid() = user_id);


-- Legacy Engine Schema
-- Stores legacy signals, clusters, trajectory points, and insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Legacy Signals Table
-- Stores individual legacy signals from journal entries
CREATE TABLE IF NOT EXISTS public.legacy_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'craft', 'martial', 'tech', 'family', 'mentor', 'impact',
    'identity', 'heritage', 'teaching', 'art', 'other'
  )),
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  direction INT NOT NULL CHECK (direction IN (-1, 1)),
  text TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy Clusters Table
-- Stores clustered legacy themes
CREATE TABLE IF NOT EXISTS public.legacy_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  significance FLOAT NOT NULL CHECK (significance >= 0 AND significance <= 1),
  domain TEXT CHECK (domain IN (
    'craft', 'martial', 'tech', 'family', 'mentor', 'impact',
    'identity', 'heritage', 'teaching', 'art', 'other'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy Trajectory Points Table
-- Stores cumulative legacy trajectory points
CREATE TABLE IF NOT EXISTS public.legacy_trajectory_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'craft', 'martial', 'tech', 'family', 'mentor', 'impact',
    'identity', 'heritage', 'teaching', 'art', 'other'
  )),
  significance FLOAT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy Insights Table
-- Stores insights and recommendations about legacy
CREATE TABLE IF NOT EXISTS public.legacy_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'legacy_foundation', 'legacy_shift', 'legacy_strengthening',
    'legacy_fragility', 'legacy_conflict', 'legacy_breakthrough',
    'legacy_contradiction'
  )),
  message TEXT NOT NULL,
  domain TEXT CHECK (domain IN (
    'craft', 'martial', 'tech', 'family', 'mentor', 'impact',
    'identity', 'heritage', 'teaching', 'art', 'other'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_legacy_signals_user_domain ON public.legacy_signals(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_legacy_signals_timestamp ON public.legacy_signals(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_signals_direction ON public.legacy_signals(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_legacy_clusters_user ON public.legacy_clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_clusters_significance ON public.legacy_clusters(user_id, significance DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_trajectory_user_domain ON public.legacy_trajectory_points(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_legacy_trajectory_timestamp ON public.legacy_trajectory_points(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_insights_user_domain ON public.legacy_insights(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_legacy_insights_type ON public.legacy_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_legacy_insights_timestamp ON public.legacy_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.legacy_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_trajectory_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own legacy signals
CREATE POLICY "Users can view own legacy signals"
  ON public.legacy_signals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own legacy signals (via service)
CREATE POLICY "Users can insert own legacy signals"
  ON public.legacy_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own legacy signals
CREATE POLICY "Users can update own legacy signals"
  ON public.legacy_signals
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own legacy signals
CREATE POLICY "Users can delete own legacy signals"
  ON public.legacy_signals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own legacy clusters
CREATE POLICY "Users can view own legacy clusters"
  ON public.legacy_clusters
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own legacy clusters (via service)
CREATE POLICY "Users can insert own legacy clusters"
  ON public.legacy_clusters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own legacy clusters
CREATE POLICY "Users can update own legacy clusters"
  ON public.legacy_clusters
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own legacy clusters
CREATE POLICY "Users can delete own legacy clusters"
  ON public.legacy_clusters
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own legacy trajectory points
CREATE POLICY "Users can view own legacy trajectory points"
  ON public.legacy_trajectory_points
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own legacy trajectory points (via service)
CREATE POLICY "Users can insert own legacy trajectory points"
  ON public.legacy_trajectory_points
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own legacy trajectory points
CREATE POLICY "Users can update own legacy trajectory points"
  ON public.legacy_trajectory_points
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own legacy trajectory points
CREATE POLICY "Users can delete own legacy trajectory points"
  ON public.legacy_trajectory_points
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own legacy insights
CREATE POLICY "Users can view own legacy insights"
  ON public.legacy_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own legacy insights (via service)
CREATE POLICY "Users can insert own legacy insights"
  ON public.legacy_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own legacy insights
CREATE POLICY "Users can update own legacy insights"
  ON public.legacy_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own legacy insights
CREATE POLICY "Users can delete own legacy insights"
  ON public.legacy_insights
  FOR DELETE
  USING (auth.uid() = user_id);


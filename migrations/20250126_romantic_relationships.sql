-- =====================================================
-- ROMANTIC RELATIONSHIPS SYSTEM
-- Purpose: Track romantic relationships, dates, situationships, and provide analytics
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Romantic Relationships Table
CREATE TABLE IF NOT EXISTS public.romantic_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL,
  person_type TEXT NOT NULL CHECK (person_type IN ('character', 'omega_entity')),
  
  -- Relationship Type
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'boyfriend', 'girlfriend', 'wife', 'husband', 'fiancé', 'fiancée',
    'lover', 'fuck_buddy', 'crush', 'obsession', 'infatuation', 'lust',
    'ex_boyfriend', 'ex_girlfriend', 'ex_wife', 'ex_husband',
    'situationship', 'dating', 'talking', 'hooking_up', 'one_night_stand',
    'complicated', 'on_break', 'friends_with_benefits', 'ex_lover', 'in_love'
  )),
  
  -- Love Status
  love_status TEXT CHECK (love_status IN (
    'in_love', 'falling_in_love', 'loved', 'love_faded', 'never_loved', 'uncertain'
  )),
  love_declared_at TIMESTAMPTZ, -- When "I love you" was first said
  love_reciprocated BOOLEAN, -- Whether they said it back
  
  -- Status & Timeline
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_break', 'ended', 'complicated', 'paused')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_current BOOLEAN DEFAULT true,
  
  -- Intensity & Feelings
  affection_score FLOAT DEFAULT 0.5 CHECK (affection_score >= 0 AND affection_score <= 1),
  emotional_intensity FLOAT DEFAULT 0.5 CHECK (emotional_intensity >= 0 AND emotional_intensity <= 1),
  physical_attraction FLOAT DEFAULT 0.5 CHECK (physical_attraction >= 0 AND physical_attraction <= 1),
  emotional_connection FLOAT DEFAULT 0.5 CHECK (emotional_connection >= 0 AND emotional_connection <= 1),
  
  -- Situationship Specific
  is_situationship BOOLEAN DEFAULT false,
  ambiguity_level FLOAT DEFAULT 0.5 CHECK (ambiguity_level >= 0 AND ambiguity_level <= 1),
  exclusivity_status TEXT CHECK (exclusivity_status IN ('exclusive', 'non_exclusive', 'unknown', 'complicated')),
  
  -- Analytics
  compatibility_score FLOAT DEFAULT 0.5 CHECK (compatibility_score >= 0 AND compatibility_score <= 1),
  relationship_health FLOAT DEFAULT 0.5 CHECK (relationship_health >= 0 AND relationship_health <= 1),
  strengths TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  red_flags TEXT[] DEFAULT '{}',
  green_flags TEXT[] DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person_id, person_type, relationship_type, status)
);

-- Romantic Dates & Milestones
CREATE TABLE IF NOT EXISTS public.romantic_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  person_id UUID NOT NULL,
  
  -- Date Info
  date_type TEXT NOT NULL CHECK (date_type IN (
    'first_date', 'anniversary', 'special_date', 'breakup', 'first_kiss',
    'first_i_love_you', 'moving_in', 'engagement', 'marriage', 'other',
    'first_meeting', 'first_sleepover', 'meeting_family', 'meeting_friends',
    'first_fight', 'makeup', 'milestone'
  )),
  date_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  description TEXT,
  
  -- Sentiment
  sentiment FLOAT CHECK (sentiment >= -1 AND sentiment <= 1),
  was_positive BOOLEAN,
  emotional_intensity FLOAT CHECK (emotional_intensity >= 0 AND emotional_intensity <= 1),
  
  -- Evidence
  source_entry_id UUID, -- journal entry or message
  source_message_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationship Analytics (snapshots over time)
CREATE TABLE IF NOT EXISTS public.relationship_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  
  -- Scores
  affection_score FLOAT CHECK (affection_score >= 0 AND affection_score <= 1),
  compatibility_score FLOAT CHECK (compatibility_score >= 0 AND compatibility_score <= 1),
  health_score FLOAT CHECK (health_score >= 0 AND health_score <= 1),
  intensity_score FLOAT CHECK (intensity_score >= 0 AND intensity_score <= 1),
  
  -- Comparison
  rank_among_all INT, -- Rank among all romantic interests
  rank_among_active INT, -- Rank among active relationships
  
  -- Trends
  affection_trend TEXT CHECK (affection_trend IN ('increasing', 'decreasing', 'stable', 'volatile')),
  health_trend TEXT CHECK (health_trend IN ('improving', 'declining', 'stable', 'volatile')),
  intensity_trend TEXT CHECK (intensity_trend IN ('increasing', 'decreasing', 'stable', 'volatile')),
  
  -- Analysis
  strengths TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  red_flags TEXT[] DEFAULT '{}',
  green_flags TEXT[] DEFAULT '{}',
  
  -- Insights
  insights TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  
  -- Calculated at
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, relationship_id, calculated_at)
);

-- Relationship Drift Detection
CREATE TABLE IF NOT EXISTS public.relationship_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  
  -- Drift Info
  drift_type TEXT NOT NULL CHECK (drift_type IN (
    'drifting_apart', 'growing_closer', 'stable', 'volatile', 'breaking_up', 'reconnecting'
  )),
  drift_strength FLOAT DEFAULT 0.5 CHECK (drift_strength >= 0 AND drift_strength <= 1),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metrics
  mention_frequency_change FLOAT, -- Change in mention frequency
  sentiment_change FLOAT, -- Change in sentiment
  interaction_frequency_change FLOAT, -- Change in interaction frequency
  time_since_last_mention_days INT,
  
  -- Evidence
  evidence TEXT,
  source_entry_ids UUID[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationship Cycles/Loops (positive and negative patterns)
CREATE TABLE IF NOT EXISTS public.relationship_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  
  -- Cycle Info
  cycle_type TEXT NOT NULL CHECK (cycle_type IN (
    'positive_loop', 'negative_loop', 'push_pull', 'hot_cold', 'on_again_off_again',
    'conflict_resolution', 'growth_cycle', 'stagnation', 'toxic_pattern'
  )),
  cycle_strength FLOAT DEFAULT 0.5 CHECK (cycle_strength >= 0 AND cycle_strength <= 1),
  cycle_frequency TEXT, -- 'daily', 'weekly', 'monthly', 'irregular'
  is_active BOOLEAN DEFAULT true,
  
  -- Pattern
  pattern_description TEXT,
  trigger_events TEXT[], -- What triggers this cycle
  cycle_duration_days INT, -- Average duration of one cycle
  
  -- Detection
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),
  observation_count INT DEFAULT 1,
  
  -- Evidence
  evidence TEXT[],
  source_entry_ids UUID[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Breakup Tracking
CREATE TABLE IF NOT EXISTS public.relationship_breakups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  
  -- Breakup Info
  breakup_date TIMESTAMPTZ NOT NULL,
  breakup_type TEXT NOT NULL CHECK (breakup_type IN (
    'mutual', 'initiated_by_user', 'initiated_by_them', 'ghosted', 'faded_away',
    'cheating', 'incompatibility', 'distance', 'circumstances', 'toxic', 'other'
  )),
  was_expected BOOLEAN,
  was_clean BOOLEAN, -- Clean breakup vs messy
  
  -- Details
  reason TEXT,
  who_initiated TEXT, -- 'user', 'them', 'mutual', 'unclear'
  closure_level FLOAT CHECK (closure_level >= 0 AND closure_level <= 1), -- 0-1: How much closure
  
  -- Recovery
  recovery_status TEXT CHECK (recovery_status IN (
    'healing', 'healed', 'struggling', 'moved_on', 'still_hurting', 'complicated'
  )),
  time_to_move_on_days INT,
  
  -- Evidence
  source_entry_id UUID,
  source_message_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationship Interactions (for tracking frequency and patterns)
CREATE TABLE IF NOT EXISTS public.romantic_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.romantic_relationships(id) ON DELETE CASCADE,
  
  -- Interaction Info
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'date', 'text', 'call', 'video_call', 'meetup', 'sleepover',
    'intimate', 'conflict', 'support', 'gift', 'celebration', 'other'
  )),
  interaction_date TIMESTAMPTZ NOT NULL,
  
  -- Sentiment & Quality
  sentiment FLOAT CHECK (sentiment >= -1 AND sentiment <= 1),
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 1),
  was_positive BOOLEAN,
  
  -- Context
  location TEXT,
  duration_minutes INT,
  description TEXT,
  
  -- Evidence
  source_entry_id UUID,
  source_message_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_romantic_relationships_user ON public.romantic_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_romantic_relationships_person ON public.romantic_relationships(user_id, person_id, person_type);
CREATE INDEX IF NOT EXISTS idx_romantic_relationships_status ON public.romantic_relationships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_romantic_relationships_current ON public.romantic_relationships(user_id, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_romantic_dates_relationship ON public.romantic_dates(relationship_id);
CREATE INDEX IF NOT EXISTS idx_romantic_dates_date ON public.romantic_dates(date_time);
CREATE INDEX IF NOT EXISTS idx_relationship_analytics_relationship ON public.relationship_analytics(relationship_id);
CREATE INDEX IF NOT EXISTS idx_relationship_analytics_calculated ON public.relationship_analytics(calculated_at);
CREATE INDEX IF NOT EXISTS idx_romantic_interactions_relationship ON public.romantic_interactions(relationship_id);
CREATE INDEX IF NOT EXISTS idx_romantic_interactions_date ON public.romantic_interactions(interaction_date);
CREATE INDEX IF NOT EXISTS idx_relationship_drift_relationship ON public.relationship_drift(relationship_id);
CREATE INDEX IF NOT EXISTS idx_relationship_drift_detected ON public.relationship_drift(detected_at);
CREATE INDEX IF NOT EXISTS idx_relationship_cycles_relationship ON public.relationship_cycles(relationship_id);
CREATE INDEX IF NOT EXISTS idx_relationship_cycles_active ON public.relationship_cycles(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_relationship_breakups_relationship ON public.relationship_breakups(relationship_id);
CREATE INDEX IF NOT EXISTS idx_relationship_breakups_date ON public.relationship_breakups(breakup_date);

-- RLS
ALTER TABLE public.romantic_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romantic_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romantic_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_drift ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_breakups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own romantic relationships"
  ON public.romantic_relationships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own romantic relationships"
  ON public.romantic_relationships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own romantic relationships"
  ON public.romantic_relationships FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own romantic relationships"
  ON public.romantic_relationships FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own romantic dates"
  ON public.romantic_dates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own romantic dates"
  ON public.romantic_dates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own romantic dates"
  ON public.romantic_dates FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own romantic dates"
  ON public.romantic_dates FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own relationship analytics"
  ON public.relationship_analytics FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own relationship analytics"
  ON public.relationship_analytics FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own romantic interactions"
  ON public.romantic_interactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own romantic interactions"
  ON public.romantic_interactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own relationship drift"
  ON public.relationship_drift FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own relationship drift"
  ON public.relationship_drift FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own relationship cycles"
  ON public.relationship_cycles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own relationship cycles"
  ON public.relationship_cycles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own relationship cycles"
  ON public.relationship_cycles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own relationship breakups"
  ON public.relationship_breakups FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own relationship breakups"
  ON public.relationship_breakups FOR INSERT
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.romantic_relationships IS 'Tracks romantic relationships, situationships, and dating';
COMMENT ON TABLE public.romantic_dates IS 'Tracks dates, milestones, and special moments in relationships';
COMMENT ON TABLE public.relationship_analytics IS 'Analytics snapshots for romantic relationships over time';
COMMENT ON TABLE public.romantic_interactions IS 'Tracks interactions with romantic partners (dates, texts, calls, etc.)';
COMMENT ON TABLE public.relationship_drift IS 'Tracks relationship drift (drifting apart, growing closer, breaking up)';
COMMENT ON TABLE public.relationship_cycles IS 'Tracks relationship cycles and loops (positive and negative patterns)';
COMMENT ON TABLE public.relationship_breakups IS 'Tracks breakups, reasons, and recovery';
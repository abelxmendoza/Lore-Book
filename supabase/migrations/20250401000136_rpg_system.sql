-- Invisible RPG System Migration
-- Hidden RPG mechanics that power story-driven experiences
-- All stats are hidden from users - only natural language insights are shown

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companion Stats Table
-- Tracks relationship depth, shared experiences, support levels (hidden)
CREATE TABLE IF NOT EXISTS public.companion_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  
  -- Relationship metrics (hidden)
  relationship_depth INTEGER DEFAULT 0 CHECK (relationship_depth >= 0 AND relationship_depth <= 100),
  shared_experiences INTEGER DEFAULT 0 CHECK (shared_experiences >= 0),
  support_level INTEGER DEFAULT 0 CHECK (support_level >= 0 AND support_level <= 10),
  influence_score INTEGER DEFAULT 0 CHECK (influence_score >= 0 AND influence_score <= 100),
  trust_level INTEGER DEFAULT 0 CHECK (trust_level >= 0 AND trust_level <= 100),
  
  -- Relationship classification
  relationship_class TEXT CHECK (relationship_class IN ('Mentor', 'Ally', 'Rival', 'Supporter', 'Family', 'Friend', 'Colleague', 'Other')),
  
  -- Synergy bonuses (hidden)
  synergy_bonuses JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, character_id)
);

-- Location Stats Table
-- Tracks location significance, visit frequency, discovery status (hidden)
CREATE TABLE IF NOT EXISTS public.location_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  
  -- Discovery and visits (hidden)
  discovery_date TIMESTAMPTZ,
  visit_count INTEGER DEFAULT 0 CHECK (visit_count >= 0),
  significance_score INTEGER DEFAULT 0 CHECK (significance_score >= 0 AND significance_score <= 100),
  location_level INTEGER DEFAULT 1 CHECK (location_level >= 1 AND location_level <= 10),
  memories_attached INTEGER DEFAULT 0 CHECK (memories_attached >= 0),
  
  -- Special locations
  is_hidden BOOLEAN DEFAULT FALSE,
  lore_points INTEGER DEFAULT 0 CHECK (lore_points >= 0),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, location_id)
);

-- Faction Stats Table
-- Tracks social groups and reputation (hidden)
CREATE TABLE IF NOT EXISTS public.faction_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Faction identification
  faction_name TEXT NOT NULL,
  faction_type TEXT CHECK (faction_type IN ('work', 'family', 'friends', 'hobby', 'community', 'other')),
  
  -- Reputation and relationships (hidden)
  reputation INTEGER DEFAULT 0 CHECK (reputation >= -100 AND reputation <= 100),
  relationship_count INTEGER DEFAULT 0 CHECK (relationship_count >= 0),
  influence_score INTEGER DEFAULT 0 CHECK (influence_score >= 0 AND influence_score <= 100),
  alliance_strength INTEGER DEFAULT 0 CHECK (alliance_strength >= 0 AND alliance_strength <= 100),
  
  -- Conflict history (hidden)
  conflict_history JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, faction_name)
);

-- Chapter Stats Table
-- Tracks chapter completion and progression (hidden)
CREATE TABLE IF NOT EXISTS public.chapter_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  
  -- Chapter identification
  chapter_title TEXT,
  chapter_period_start TIMESTAMPTZ,
  chapter_period_end TIMESTAMPTZ,
  
  -- Completion and progression (hidden)
  completion_status TEXT DEFAULT 'active' CHECK (completion_status IN ('active', 'completed', 'paused')),
  xp_earned INTEGER DEFAULT 0 CHECK (xp_earned >= 0),
  quests_completed INTEGER DEFAULT 0 CHECK (quests_completed >= 0),
  skills_gained TEXT[] DEFAULT '{}',
  
  -- Ratings (hidden)
  difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 10),
  enjoyment_rating INTEGER CHECK (enjoyment_rating >= 1 AND enjoyment_rating <= 10),
  growth_rating INTEGER CHECK (growth_rating >= 1 AND growth_rating <= 10),
  reflection_bonus INTEGER DEFAULT 0 CHECK (reflection_bonus >= 0),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, chapter_id)
);

-- Challenge Stats Table
-- Tracks life challenges and outcomes (hidden)
CREATE TABLE IF NOT EXISTS public.challenge_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Challenge identification
  challenge_name TEXT NOT NULL,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('health', 'career', 'relationship', 'personal', 'financial', 'other')),
  challenge_start_date TIMESTAMPTZ,
  challenge_end_date TIMESTAMPTZ,
  
  -- Victory conditions and outcome
  victory_condition TEXT,
  outcome TEXT CHECK (outcome IN ('victory', 'defeat', 'ongoing', 'abandoned')),
  
  -- Rewards and learning (hidden)
  xp_reward INTEGER DEFAULT 0 CHECK (xp_reward >= 0),
  lessons_learned TEXT[] DEFAULT '{}',
  resilience_gained INTEGER DEFAULT 0 CHECK (resilience_gained >= 0 AND resilience_gained <= 100),
  
  -- Boss challenges
  is_boss_challenge BOOLEAN DEFAULT FALSE,
  
  -- Related entities
  related_quest_id UUID REFERENCES public.quests(id),
  related_character_ids UUID[] DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resource Stats Table
-- Tracks daily energy, emotional stamina, social capital (hidden)
CREATE TABLE IF NOT EXISTS public.resource_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Resources (hidden)
  daily_energy INTEGER DEFAULT 50 CHECK (daily_energy >= 0 AND daily_energy <= 100),
  emotional_stamina INTEGER DEFAULT 50 CHECK (emotional_stamina >= 0 AND emotional_stamina <= 100),
  social_capital INTEGER DEFAULT 50 CHECK (social_capital >= 0 AND social_capital <= 100),
  time_efficiency INTEGER DEFAULT 50 CHECK (time_efficiency >= 0 AND time_efficiency <= 100),
  knowledge_points INTEGER DEFAULT 0 CHECK (knowledge_points >= 0),
  
  -- Resource trends (hidden)
  resource_trends JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

-- Quest Chain Table
-- Tracks epic quest chains and dependencies (hidden)
CREATE TABLE IF NOT EXISTS public.quest_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Chain identification
  chain_id UUID NOT NULL,
  chain_name TEXT NOT NULL,
  chain_description TEXT,
  
  -- Quest relationships
  quest_ids UUID[] DEFAULT '{}',
  dependencies JSONB DEFAULT '[]'::jsonb,
  branching_points JSONB DEFAULT '[]'::jsonb,
  consequences JSONB DEFAULT '[]'::jsonb,
  
  -- Progress (hidden)
  storyline_progress INTEGER DEFAULT 0 CHECK (storyline_progress >= 0 AND storyline_progress <= 100),
  epic_completion BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, chain_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_companion_stats_user ON public.companion_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_companion_stats_character ON public.companion_stats(character_id);
CREATE INDEX IF NOT EXISTS idx_location_stats_user ON public.location_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_location_stats_location ON public.location_stats(location_id);
CREATE INDEX IF NOT EXISTS idx_faction_stats_user ON public.faction_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_chapter_stats_user ON public.chapter_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_chapter_stats_chapter ON public.chapter_stats(chapter_id);
CREATE INDEX IF NOT EXISTS idx_challenge_stats_user ON public.challenge_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_stats_user ON public.resource_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_stats_date ON public.resource_stats(user_id, date);
CREATE INDEX IF NOT EXISTS idx_quest_chains_user ON public.quest_chains(user_id);
CREATE INDEX IF NOT EXISTS idx_quest_chains_chain ON public.quest_chains(chain_id);

-- RLS Policies
ALTER TABLE public.companion_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faction_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_chains ENABLE ROW LEVEL SECURITY;

-- Companion Stats RLS
CREATE POLICY "Users can view their own companion stats"
  ON public.companion_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own companion stats"
  ON public.companion_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own companion stats"
  ON public.companion_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Location Stats RLS
CREATE POLICY "Users can view their own location stats"
  ON public.location_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own location stats"
  ON public.location_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own location stats"
  ON public.location_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Faction Stats RLS
CREATE POLICY "Users can view their own faction stats"
  ON public.faction_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own faction stats"
  ON public.faction_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own faction stats"
  ON public.faction_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Chapter Stats RLS
CREATE POLICY "Users can view their own chapter stats"
  ON public.chapter_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chapter stats"
  ON public.chapter_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chapter stats"
  ON public.chapter_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Challenge Stats RLS
CREATE POLICY "Users can view their own challenge stats"
  ON public.challenge_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own challenge stats"
  ON public.challenge_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own challenge stats"
  ON public.challenge_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Resource Stats RLS
CREATE POLICY "Users can view their own resource stats"
  ON public.resource_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resource stats"
  ON public.resource_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resource stats"
  ON public.resource_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Quest Chains RLS
CREATE POLICY "Users can view their own quest chains"
  ON public.quest_chains FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quest chains"
  ON public.quest_chains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quest chains"
  ON public.quest_chains FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.companion_stats IS 'Hidden RPG stats for character relationships. Never shown to users - only used for generating insights.';
COMMENT ON TABLE public.location_stats IS 'Hidden RPG stats for location exploration. Never shown to users - only used for generating insights.';
COMMENT ON TABLE public.faction_stats IS 'Hidden RPG stats for social groups. Never shown to users - only used for generating insights.';
COMMENT ON TABLE public.chapter_stats IS 'Hidden RPG stats for life chapters. Never shown to users - only used for generating insights.';
COMMENT ON TABLE public.challenge_stats IS 'Hidden RPG stats for life challenges. Never shown to users - only used for generating insights.';
COMMENT ON TABLE public.resource_stats IS 'Hidden RPG stats for daily resources. Never shown to users - only used for generating insights.';
COMMENT ON TABLE public.quest_chains IS 'Hidden RPG stats for quest chains. Never shown to users - only used for generating insights.';

-- Skills & Achievements System
-- Gamification layer for tracking life progress and learning

-- Skills Table
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Skill identification
  skill_name TEXT NOT NULL,
  skill_category TEXT NOT NULL CHECK (skill_category IN (
    'professional', 'creative', 'physical', 'social', 'intellectual', 
    'emotional', 'practical', 'artistic', 'technical', 'other'
  )),
  
  -- Progress tracking
  current_level INTEGER DEFAULT 1 CHECK (current_level >= 1),
  total_xp INTEGER DEFAULT 0 CHECK (total_xp >= 0),
  xp_to_next_level INTEGER DEFAULT 100 CHECK (xp_to_next_level >= 0),
  
  -- Metadata
  description TEXT NULL,
  first_mentioned_at TIMESTAMPTZ NOT NULL,
  last_practiced_at TIMESTAMPTZ NULL,
  practice_count INTEGER DEFAULT 0,
  
  -- Auto-detection
  auto_detected BOOLEAN DEFAULT FALSE,
  confidence_score NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint: one skill per user
  UNIQUE(user_id, skill_name)
);

-- Skill Progress History (for tracking XP over time)
CREATE TABLE IF NOT EXISTS public.skill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  xp_gained INTEGER NOT NULL CHECK (xp_gained > 0),
  level_before INTEGER NOT NULL,
  level_after INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('memory', 'achievement', 'manual')),
  source_id UUID NULL, -- journal_entries.id or achievements.id
  
  notes TEXT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Achievements Table
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Achievement details
  achievement_name TEXT NOT NULL,
  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'milestone', 'streak', 'skill_level', 'xp_milestone', 
    'consistency', 'exploration', 'reflection', 'growth', 'other'
  )),
  description TEXT NULL,
  icon_name TEXT NULL, -- For UI display
  
  -- Unlock criteria
  criteria_met JSONB NOT NULL DEFAULT '{}', -- Flexible criteria storage
  unlocked_at TIMESTAMPTZ NOT NULL,
  
  -- Rewards
  xp_reward INTEGER DEFAULT 0 CHECK (xp_reward >= 0),
  skill_xp_rewards JSONB DEFAULT '{}', -- { skill_id: xp_amount }
  
  -- Metadata
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Achievement Templates (for auto-detection)
CREATE TABLE IF NOT EXISTS public.achievement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  achievement_name TEXT NOT NULL UNIQUE,
  achievement_type TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_name TEXT NULL,
  
  -- Criteria definition
  criteria_type TEXT NOT NULL, -- 'streak', 'count', 'level', 'xp', 'custom'
  criteria_config JSONB NOT NULL DEFAULT '{}',
  
  -- Rewards
  xp_reward INTEGER DEFAULT 0,
  
  -- Metadata
  rarity TEXT DEFAULT 'common',
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS skills_user_id_idx ON public.skills(user_id);
CREATE INDEX IF NOT EXISTS skills_category_idx ON public.skills(skill_category);
CREATE INDEX IF NOT EXISTS skills_active_idx ON public.skills(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS skill_progress_skill_id_idx ON public.skill_progress(skill_id);
CREATE INDEX IF NOT EXISTS skill_progress_user_id_idx ON public.skill_progress(user_id);
CREATE INDEX IF NOT EXISTS skill_progress_timestamp_idx ON public.skill_progress(timestamp);
CREATE INDEX IF NOT EXISTS achievements_user_id_idx ON public.achievements(user_id);
CREATE INDEX IF NOT EXISTS achievements_type_idx ON public.achievements(achievement_type);
CREATE INDEX IF NOT EXISTS achievements_unlocked_at_idx ON public.achievements(user_id, unlocked_at);

-- Comments
COMMENT ON TABLE public.skills IS 'User skills tracked from journal entries. Auto-detected or manually added.';
COMMENT ON TABLE public.skill_progress IS 'History of XP gains and level ups for skills.';
COMMENT ON TABLE public.achievements IS 'Unlocked achievements for gamification.';
COMMENT ON TABLE public.achievement_templates IS 'Templates for auto-detecting achievements.';

-- RLS Policies
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_templates ENABLE ROW LEVEL SECURITY;

-- Skills RLS
CREATE POLICY "Users can view their own skills"
  ON public.skills FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own skills"
  ON public.skills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own skills"
  ON public.skills FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own skills"
  ON public.skills FOR DELETE
  USING (auth.uid() = user_id);

-- Skill Progress RLS
CREATE POLICY "Users can view their own skill progress"
  ON public.skill_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own skill progress"
  ON public.skill_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Achievements RLS
CREATE POLICY "Users can view their own achievements"
  ON public.achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own achievements"
  ON public.achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Achievement Templates RLS (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view achievement templates"
  ON public.achievement_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Insert default achievement templates
INSERT INTO public.achievement_templates (achievement_name, achievement_type, description, icon_name, criteria_type, criteria_config, xp_reward, rarity) VALUES
  ('First Entry', 'milestone', 'Wrote your first journal entry', 'book-open', 'count', '{"target": 1, "entity": "journal_entries"}', 50, 'common'),
  ('Week Warrior', 'streak', '7 days of consecutive journaling', 'flame', 'streak', '{"target": 7, "entity": "journal_entries"}', 100, 'common'),
  ('Month Master', 'streak', '30 days of consecutive journaling', 'flame', 'streak', '{"target": 30, "entity": "journal_entries"}', 500, 'uncommon'),
  ('Century Club', 'milestone', '100 journal entries', 'book-open', 'count', '{"target": 100, "entity": "journal_entries"}', 200, 'uncommon'),
  ('Level 5', 'xp_milestone', 'Reached Level 5', 'trophy', 'level', '{"target": 5}', 250, 'common'),
  ('Level 10', 'xp_milestone', 'Reached Level 10', 'trophy', 'level', '{"target": 10}', 500, 'uncommon'),
  ('Level 20', 'xp_milestone', 'Reached Level 20', 'trophy', 'level', '{"target": 20}', 1000, 'rare'),
  ('Skill Master', 'skill_level', 'Reached level 10 in any skill', 'award', 'skill_level', '{"target": 10}', 300, 'uncommon'),
  ('Jack of All Trades', 'exploration', 'Tracked 10 different skills', 'users', 'count', '{"target": 10, "entity": "skills"}', 400, 'rare'),
  ('Reflection Master', 'reflection', 'Added 50 reactions to memories', 'brain', 'count', '{"target": 50, "entity": "reaction_entries"}', 350, 'uncommon'),
  ('Perception Explorer', 'exploration', 'Tracked 25 perceptions', 'eye', 'count', '{"target": 25, "entity": "perception_entries"}', 300, 'uncommon'),
  ('Memory Keeper', 'milestone', '500 memories recorded', 'book-open', 'count', '{"target": 500, "entity": "journal_entries"}', 750, 'rare'),
  ('Consistency Champion', 'consistency', '100 days of journaling', 'calendar', 'count', '{"target": 100, "entity": "journal_entries", "timeframe": "days"}', 600, 'rare'),
  ('Growth Seeker', 'growth', 'Leveled up 5 different skills', 'trending-up', 'count', '{"target": 5, "entity": "skill_levels"}', 450, 'uncommon')
ON CONFLICT DO NOTHING;

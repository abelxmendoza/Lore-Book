-- Quest System Migration
-- Comprehensive quest tracking system with main/side quests, multi-dimensional ranking, and completion history

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Quests Table
-- Main quest table with quest_type, ranking dimensions, progress tracking
CREATE TABLE IF NOT EXISTS public.quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Quest identification
  title TEXT NOT NULL,
  description TEXT,
  quest_type TEXT NOT NULL CHECK (quest_type IN ('main', 'side', 'daily', 'achievement')),
  
  -- Ranking dimensions
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  impact INTEGER NOT NULL DEFAULT 5 CHECK (impact >= 1 AND impact <= 10),
  difficulty INTEGER DEFAULT 5 CHECK (difficulty >= 1 AND difficulty <= 10),
  effort_hours DECIMAL(5,2), -- Estimated hours
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'completed', 'abandoned', 'archived'
  )),
  
  -- Completion tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  completion_notes TEXT, -- Reflection on completion
  
  -- Quest relationships
  parent_quest_id UUID REFERENCES public.quests(id), -- For quest chains
  related_goal_id UUID REFERENCES public.goals(id), -- Link to existing goal
  related_task_id UUID REFERENCES public.tasks(id), -- Link to existing task
  quest_chain_id UUID, -- Group related quests
  
  -- Progress tracking
  progress_percentage DECIMAL(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  milestones JSONB DEFAULT '[]'::jsonb,
  
  -- Rewards & motivation
  reward_description TEXT, -- What you get when completed
  motivation_notes TEXT, -- Why this quest matters
  
  -- Time tracking
  estimated_completion_date TIMESTAMPTZ,
  actual_completion_date TIMESTAMPTZ,
  time_spent_hours DECIMAL(8,2) DEFAULT 0,
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  category TEXT, -- 'career', 'health', 'relationships', 'creative', etc.
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'extracted', 'suggested', 'imported')),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ
);

-- Quest History Table
-- Event log for quest lifecycle (created, started, completed, etc.)
CREATE TABLE IF NOT EXISTS public.quest_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- History event
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'started', 'progress_update', 'milestone_achieved',
    'paused', 'resumed', 'completed', 'abandoned', 'reflected'
  )),
  
  -- Event details
  description TEXT,
  progress_before DECIMAL(5,2),
  progress_after DECIMAL(5,2),
  notes TEXT, -- User reflection
  
  -- Context
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  related_quest_ids UUID[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Quest Dependencies Table
-- Quest dependency relationships
CREATE TABLE IF NOT EXISTS public.quest_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  depends_on_quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  dependency_type TEXT DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'recommends', 'enables')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quest_id, depends_on_quest_id)
);

-- Quest Achievements Table
-- Rewards/unlocks for quest completion
CREATE TABLE IF NOT EXISTS public.quest_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'completion', 'milestone', 'streak', 'speed', 'quality'
  )),
  title TEXT NOT NULL,
  description TEXT,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_quests_user_status ON public.quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_user_type ON public.quests(user_id, quest_type);
CREATE INDEX IF NOT EXISTS idx_quests_user_priority ON public.quests(user_id, priority DESC, importance DESC, impact DESC);
CREATE INDEX IF NOT EXISTS idx_quests_user_completed ON public.quests(user_id, completed_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_quests_parent ON public.quests(parent_quest_id);
CREATE INDEX IF NOT EXISTS idx_quests_goal ON public.quests(related_goal_id) WHERE related_goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quests_task ON public.quests(related_task_id) WHERE related_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quests_category ON public.quests(user_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quests_chain ON public.quests(user_id, quest_chain_id) WHERE quest_chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quests_created ON public.quests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quests_tags ON public.quests USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_quest_history_quest ON public.quest_history(quest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quest_history_user ON public.quest_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quest_history_type ON public.quest_history(user_id, event_type);

CREATE INDEX IF NOT EXISTS idx_quest_dependencies_quest ON public.quest_dependencies(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_dependencies_depends ON public.quest_dependencies(depends_on_quest_id);

CREATE INDEX IF NOT EXISTS idx_quest_achievements_quest ON public.quest_achievements(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_achievements_user ON public.quest_achievements(user_id, unlocked_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_achievements ENABLE ROW LEVEL SECURITY;

-- Users can only see their own quests
CREATE POLICY "Users can view own quests"
  ON public.quests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own quests
CREATE POLICY "Users can insert own quests"
  ON public.quests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own quests
CREATE POLICY "Users can update own quests"
  ON public.quests
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own quests
CREATE POLICY "Users can delete own quests"
  ON public.quests
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own quest history
CREATE POLICY "Users can view own quest history"
  ON public.quest_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own quest history
CREATE POLICY "Users can insert own quest history"
  ON public.quest_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only see their own quest dependencies
CREATE POLICY "Users can view own quest dependencies"
  ON public.quest_dependencies
  FOR SELECT
  USING (auth.uid() IN (
    SELECT user_id FROM public.quests WHERE id = quest_id
  ));

-- Users can insert their own quest dependencies
CREATE POLICY "Users can insert own quest dependencies"
  ON public.quest_dependencies
  FOR INSERT
  WITH CHECK (auth.uid() IN (
    SELECT user_id FROM public.quests WHERE id = quest_id
  ));

-- Users can delete their own quest dependencies
CREATE POLICY "Users can delete own quest dependencies"
  ON public.quest_dependencies
  FOR DELETE
  USING (auth.uid() IN (
    SELECT user_id FROM public.quests WHERE id = quest_id
  ));

-- Users can only see their own quest achievements
CREATE POLICY "Users can view own quest achievements"
  ON public.quest_achievements
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own quest achievements
CREATE POLICY "Users can insert own quest achievements"
  ON public.quest_achievements
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.quests IS 'Main quest table tracking goals, todos, and quests with multi-dimensional ranking';
COMMENT ON COLUMN public.quests.quest_type IS 'Type of quest: main (primary objectives), side (secondary), daily (short-term), achievement (milestone-based)';
COMMENT ON COLUMN public.quests.priority IS 'Urgency/importance ranking (1-10)';
COMMENT ON COLUMN public.quests.importance IS 'Long-term significance ranking (1-10)';
COMMENT ON COLUMN public.quests.impact IS 'Expected outcome magnitude ranking (1-10)';
COMMENT ON COLUMN public.quests.difficulty IS 'Effort/complexity ranking (1-10)';
COMMENT ON COLUMN public.quests.progress_percentage IS 'Progress from 0-100, can be milestone-based or percentage-based';
COMMENT ON COLUMN public.quests.completion_notes IS 'User reflection on quest completion';

COMMENT ON TABLE public.quest_history IS 'Event log for quest lifecycle tracking';
COMMENT ON TABLE public.quest_dependencies IS 'Quest dependency relationships (blocks, recommends, enables)';
COMMENT ON TABLE public.quest_achievements IS 'Rewards and unlocks for quest completion';

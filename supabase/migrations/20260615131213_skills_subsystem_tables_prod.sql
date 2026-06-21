-- Mirrored from supabase_migrations.schema_migrations (version 20260615131213).
-- Applied on remote before this file existed in the repo.

-- Skills subsystem tables missing in production (skills/skill_evidence/skill_suggestions/skill_usage_events already exist).
-- Idempotent: IF NOT EXISTS on tables/indexes, DROP POLICY IF EXISTS before CREATE POLICY.

-- skill_progress: XP / level-up history (used by skillService.addXP & getSkillProgress)
CREATE TABLE IF NOT EXISTS public.skill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_gained INTEGER NOT NULL CHECK (xp_gained > 0),
  level_before INTEGER NOT NULL,
  level_after INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('memory', 'achievement', 'manual')),
  source_id UUID NULL,
  notes TEXT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skill_progress_skill_id_idx ON public.skill_progress(skill_id);
CREATE INDEX IF NOT EXISTS skill_progress_user_id_idx ON public.skill_progress(user_id);
CREATE INDEX IF NOT EXISTS skill_progress_timestamp_idx ON public.skill_progress(timestamp);
ALTER TABLE public.skill_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own skill progress" ON public.skill_progress;
CREATE POLICY "Users can view their own skill progress" ON public.skill_progress FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own skill progress" ON public.skill_progress;
CREATE POLICY "Users can insert their own skill progress" ON public.skill_progress FOR INSERT WITH CHECK (auth.uid() = user_id);

-- skill_relationships: prerequisite/synergy graph
CREATE TABLE IF NOT EXISTS public.skill_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  to_skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'prerequisite_for','requires','builds_on','foundation_for','complements',
    'synergizes_with','related_to','specialization_of','generalization_of',
    'alternative_to','evolves_into','learned_with','practiced_with','taught_with',
    'transfers_to','applies_to'
  )),
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  strength FLOAT DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
  evidence_count INT DEFAULT 1,
  evidence_source_ids UUID[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, from_skill_id, to_skill_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_user ON public.skill_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_from ON public.skill_relationships(from_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_to ON public.skill_relationships(to_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_type ON public.skill_relationships(relationship_type);
ALTER TABLE public.skill_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own skill relationships" ON public.skill_relationships;
CREATE POLICY "Users can view own skill relationships" ON public.skill_relationships FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own skill relationships" ON public.skill_relationships;
CREATE POLICY "Users can insert own skill relationships" ON public.skill_relationships FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own skill relationships" ON public.skill_relationships;
CREATE POLICY "Users can update own skill relationships" ON public.skill_relationships FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own skill relationships" ON public.skill_relationships;
CREATE POLICY "Users can delete own skill relationships" ON public.skill_relationships FOR DELETE USING (user_id = auth.uid());

-- skill_clusters: grouped skill domains
CREATE TABLE IF NOT EXISTS public.skill_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL,
  skill_ids UUID[] NOT NULL,
  cluster_type TEXT,
  description TEXT,
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cluster_name)
);
CREATE INDEX IF NOT EXISTS idx_skill_clusters_user ON public.skill_clusters(user_id);
ALTER TABLE public.skill_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own skill clusters" ON public.skill_clusters;
CREATE POLICY "Users can view own skill clusters" ON public.skill_clusters FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own skill clusters" ON public.skill_clusters;
CREATE POLICY "Users can insert own skill clusters" ON public.skill_clusters FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own skill clusters" ON public.skill_clusters;
CREATE POLICY "Users can update own skill clusters" ON public.skill_clusters FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own skill clusters" ON public.skill_clusters;
CREATE POLICY "Users can delete own skill clusters" ON public.skill_clusters FOR DELETE USING (user_id = auth.uid());

-- achievements + templates (skill XP can award achievements)
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_name TEXT NOT NULL,
  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'milestone','streak','skill_level','xp_milestone','consistency','exploration','reflection','growth','other'
  )),
  description TEXT NULL,
  icon_name TEXT NULL,
  criteria_met JSONB NOT NULL DEFAULT '{}',
  unlocked_at TIMESTAMPTZ NOT NULL,
  xp_reward INTEGER DEFAULT 0 CHECK (xp_reward >= 0),
  skill_xp_rewards JSONB DEFAULT '{}',
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS achievements_user_id_idx ON public.achievements(user_id);
CREATE INDEX IF NOT EXISTS achievements_type_idx ON public.achievements(achievement_type);
CREATE INDEX IF NOT EXISTS achievements_unlocked_at_idx ON public.achievements(user_id, unlocked_at);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.achievements;
CREATE POLICY "Users can view their own achievements" ON public.achievements FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own achievements" ON public.achievements;
CREATE POLICY "Users can insert their own achievements" ON public.achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.achievement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_name TEXT NOT NULL UNIQUE,
  achievement_type TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_name TEXT NULL,
  criteria_type TEXT NOT NULL,
  criteria_config JSONB NOT NULL DEFAULT '{}',
  xp_reward INTEGER DEFAULT 0,
  rarity TEXT DEFAULT 'common',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.achievement_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view achievement templates" ON public.achievement_templates;
CREATE POLICY "Authenticated users can view achievement templates" ON public.achievement_templates FOR SELECT USING (auth.role() = 'authenticated');
INSERT INTO public.achievement_templates (achievement_name, achievement_type, description, icon_name, criteria_type, criteria_config, xp_reward, rarity) VALUES
  ('First Entry', 'milestone', 'Wrote your first journal entry', 'book-open', 'count', '{"target": 1, "entity": "journal_entries"}', 50, 'common'),
  ('Week Warrior', 'streak', '7 days of consecutive journaling', 'flame', 'streak', '{"target": 7, "entity": "journal_entries"}', 100, 'common'),
  ('Month Master', 'streak', '30 days of consecutive journaling', 'flame', 'streak', '{"target": 30, "entity": "journal_entries"}', 500, 'uncommon'),
  ('Century Club', 'milestone', '100 journal entries', 'book-open', 'count', '{"target": 100, "entity": "journal_entries"}', 200, 'uncommon'),
  ('Level 5', 'xp_milestone', 'Reached Level 5', 'trophy', 'level', '{"target": 5}', 250, 'common'),
  ('Level 10', 'xp_milestone', 'Reached Level 10', 'trophy', 'level', '{"target": 10}', 500, 'uncommon'),
  ('Level 20', 'xp_milestone', 'Reached Level 20', 'trophy', 'level', '{"target": 20}', 1000, 'rare'),
  ('Skill Master', 'skill_level', 'Reached level 10 in any skill', 'award', 'skill_level', '{"target": 10}', 300, 'uncommon'),
  ('Jack of All Trades', 'exploration', 'Tracked 10 different skills', 'users', 'count', '{"target": 10, "entity": "skills"}', 400, 'rare')
ON CONFLICT DO NOTHING;

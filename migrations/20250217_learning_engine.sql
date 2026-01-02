-- Learning Engine Schema
-- Tracks skills, knowledge, concepts, and learning progress over time

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Learning Records Table
-- Stores all learning records (skills, knowledge, concepts, etc.)
CREATE TABLE IF NOT EXISTS public.learning_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'skill', 'knowledge', 'concept', 'technique', 
    'tool', 'language', 'framework', 'methodology'
  )),
  name TEXT NOT NULL,
  description TEXT,
  proficiency TEXT NOT NULL CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('journal_entry', 'conversation', 'project', 'course', 'experience')),
  source_id UUID NOT NULL,
  source_date TIMESTAMPTZ NOT NULL,
  tags TEXT[] DEFAULT '{}',
  related_experiences UUID[] DEFAULT '{}',
  related_projects TEXT[] DEFAULT '{}',
  first_mentioned TIMESTAMPTZ DEFAULT NOW(),
  last_mentioned TIMESTAMPTZ DEFAULT NOW(),
  progress_timeline JSONB DEFAULT '[]'::jsonb,
  practice_count INT DEFAULT 1,
  mastery_indicators TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning Patterns Table
-- Tracks learning themes and patterns
CREATE TABLE IF NOT EXISTS public.learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  record_ids UUID[] DEFAULT '{}',
  total_skills INT DEFAULT 0,
  avg_proficiency FLOAT DEFAULT 0.0,
  first_learned TIMESTAMPTZ DEFAULT NOW(),
  last_learned TIMESTAMPTZ DEFAULT NOW(),
  growth_rate FLOAT DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, theme)
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_learning_records_user ON public.learning_records(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_records_type ON public.learning_records(user_id, type);
CREATE INDEX IF NOT EXISTS idx_learning_records_proficiency ON public.learning_records(user_id, proficiency);
CREATE INDEX IF NOT EXISTS idx_learning_records_source ON public.learning_records(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_learning_records_date ON public.learning_records(user_id, source_date DESC);
CREATE INDEX IF NOT EXISTS idx_learning_records_practice ON public.learning_records(user_id, practice_count DESC);
CREATE INDEX IF NOT EXISTS idx_learning_records_tags_gin ON public.learning_records USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_learning_records_name ON public.learning_records(user_id, name);

CREATE INDEX IF NOT EXISTS idx_learning_patterns_user ON public.learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_theme ON public.learning_patterns(user_id, theme);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_growth ON public.learning_patterns(user_id, growth_rate DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_records_owner_select ON public.learning_records
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY learning_records_owner_insert ON public.learning_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY learning_records_owner_update ON public.learning_records
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY learning_records_owner_delete ON public.learning_records
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY learning_patterns_owner_select ON public.learning_patterns
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY learning_patterns_owner_insert ON public.learning_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY learning_patterns_owner_update ON public.learning_patterns
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY learning_patterns_owner_delete ON public.learning_patterns
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp for learning_records
CREATE OR REPLACE FUNCTION update_learning_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_records_updated_at
  BEFORE UPDATE ON public.learning_records
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_records_updated_at();

-- Auto-update updated_at timestamp for learning_patterns
CREATE OR REPLACE FUNCTION update_learning_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_patterns_updated_at
  BEFORE UPDATE ON public.learning_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_patterns_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.learning_records IS 'Stores learning records: skills, knowledge, concepts, techniques, tools, languages, frameworks, and methodologies';
COMMENT ON COLUMN public.learning_records.type IS 'Type of learning: skill, knowledge, concept, technique, tool, language, framework, methodology';
COMMENT ON COLUMN public.learning_records.proficiency IS 'Proficiency level: beginner, intermediate, advanced, expert';
COMMENT ON COLUMN public.learning_records.source IS 'Where learning was extracted from: journal_entry, conversation, project, course, experience';
COMMENT ON COLUMN public.learning_records.practice_count IS 'Number of times this learning has been practiced/mentioned';
COMMENT ON COLUMN public.learning_records.progress_timeline IS 'JSON array tracking proficiency changes over time';

COMMENT ON TABLE public.learning_patterns IS 'Tracks learning themes and patterns across multiple learning records';
COMMENT ON COLUMN public.learning_patterns.theme IS 'The learning theme (e.g., "programming", "design", "communication")';
COMMENT ON COLUMN public.learning_patterns.growth_rate IS 'Skills learned per month in this theme';


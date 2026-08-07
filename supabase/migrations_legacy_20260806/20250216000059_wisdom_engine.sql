-- Wisdom Engine Schema
-- Stores extracted wisdom statements, life lessons, insights, and realizations

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Wisdom Statements Table
-- Stores all extracted wisdom statements
CREATE TABLE IF NOT EXISTS public.wisdom_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'life_lesson', 'insight', 'realization', 'principle',
    'philosophy', 'advice', 'observation', 'truth'
  )),
  statement TEXT NOT NULL,
  context TEXT,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('journal_entry', 'conversation', 'reflection', 'pattern_analysis')),
  source_id UUID NOT NULL,
  source_date TIMESTAMPTZ NOT NULL,
  tags TEXT[] DEFAULT '{}',
  related_experiences UUID[] DEFAULT '{}',
  related_patterns TEXT[] DEFAULT '{}',
  recurrence_count INT DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  evolution JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wisdom Patterns Table
-- Tracks recurring wisdom themes
CREATE TABLE IF NOT EXISTS public.wisdom_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  statement_ids UUID[] DEFAULT '{}',
  frequency INT DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  evolution_timeline JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, theme)
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_wisdom_statements_user ON public.wisdom_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_wisdom_statements_category ON public.wisdom_statements(user_id, category);
CREATE INDEX IF NOT EXISTS idx_wisdom_statements_source ON public.wisdom_statements(user_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_wisdom_statements_date ON public.wisdom_statements(user_id, source_date DESC);
CREATE INDEX IF NOT EXISTS idx_wisdom_statements_recurrence ON public.wisdom_statements(user_id, recurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_wisdom_statements_tags_gin ON public.wisdom_statements USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_wisdom_statements_confidence ON public.wisdom_statements(user_id, confidence DESC) WHERE confidence >= 0.7;

CREATE INDEX IF NOT EXISTS idx_wisdom_patterns_user ON public.wisdom_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_wisdom_patterns_frequency ON public.wisdom_patterns(user_id, frequency DESC);
CREATE INDEX IF NOT EXISTS idx_wisdom_patterns_theme ON public.wisdom_patterns(user_id, theme);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.wisdom_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wisdom_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY wisdom_statements_owner_select ON public.wisdom_statements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wisdom_statements_owner_insert ON public.wisdom_statements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wisdom_statements_owner_update ON public.wisdom_statements
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wisdom_statements_owner_delete ON public.wisdom_statements
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY wisdom_patterns_owner_select ON public.wisdom_patterns
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wisdom_patterns_owner_insert ON public.wisdom_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wisdom_patterns_owner_update ON public.wisdom_patterns
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wisdom_patterns_owner_delete ON public.wisdom_patterns
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp for wisdom_statements
CREATE OR REPLACE FUNCTION update_wisdom_statements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wisdom_statements_updated_at
  BEFORE UPDATE ON public.wisdom_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_wisdom_statements_updated_at();

-- Auto-update updated_at timestamp for wisdom_patterns
CREATE OR REPLACE FUNCTION update_wisdom_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wisdom_patterns_updated_at
  BEFORE UPDATE ON public.wisdom_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_wisdom_patterns_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.wisdom_statements IS 'Stores extracted wisdom statements, life lessons, insights, and realizations from journal entries and conversations';
COMMENT ON COLUMN public.wisdom_statements.category IS 'Type of wisdom: life_lesson, insight, realization, principle, philosophy, advice, observation, truth';
COMMENT ON COLUMN public.wisdom_statements.source IS 'Where wisdom was extracted from: journal_entry, conversation, reflection, pattern_analysis';
COMMENT ON COLUMN public.wisdom_statements.recurrence_count IS 'Number of times similar wisdom has appeared (for tracking recurring themes)';
COMMENT ON COLUMN public.wisdom_statements.evolution IS 'JSON array tracking how this wisdom has evolved over time';

COMMENT ON TABLE public.wisdom_patterns IS 'Tracks recurring wisdom themes across multiple statements';
COMMENT ON COLUMN public.wisdom_patterns.theme IS 'The recurring wisdom theme';
COMMENT ON COLUMN public.wisdom_patterns.statement_ids IS 'Array of wisdom statement IDs that share this theme';


-- Advanced Analytics System Database Schema
-- Creates tables and indexes for analytics engine

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Try to enable pgvector/vector extension
-- In Supabase, it's usually called "vector" not "pgvector"
-- Enable it in Dashboard > Database > Extensions > Enable "vector"
DO $$ 
BEGIN
  -- Try "vector" first (Supabase naming)
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
  BEGIN
    -- Fallback to "pgvector" (standard naming)
    CREATE EXTENSION IF NOT EXISTS "pgvector";
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Vector extension not available. Enable "vector" in Supabase Dashboard > Database > Extensions';
  END;
END $$;

-- Try to enable pg_trgm (for trigram search)
DO $$ 
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension not available. Some search features may be limited.';
END $$;

-- ============================================
-- ENHANCE JOURNAL_ENTRIES TABLE
-- ============================================

-- Add sentiment field (FLOAT) if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' AND column_name = 'sentiment'
  ) THEN
    ALTER TABLE public.journal_entries ADD COLUMN sentiment FLOAT;
  END IF;
END $$;

-- Add people array field if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' AND column_name = 'people'
  ) THEN
    ALTER TABLE public.journal_entries ADD COLUMN people TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS journal_entries_sentiment_idx ON public.journal_entries(sentiment) WHERE sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_entries_people_idx ON public.journal_entries USING GIN(people);
CREATE INDEX IF NOT EXISTS journal_entries_mood_idx ON public.journal_entries(mood) WHERE mood IS NOT NULL;

-- Upgrade embedding index to HNSW if using pgvector >= 0.5.0
-- (Keep IVFFlat as fallback for older versions)
-- Note: HNSW is more efficient but requires pgvector 0.5.0+
-- For now, we'll keep IVFFlat but add a comment
COMMENT ON INDEX journal_entries_embedding_idx IS 'Consider upgrading to HNSW index for better performance: CREATE INDEX journal_entries_embedding_hnsw_idx ON journal_entries USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);';

-- ============================================
-- ANALYTICS CACHE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'identity_pulse',
    'relationship_analytics',
    'saga',
    'memory_fabric',
    'insights',
    'predictions',
    'shadow',
    'xp',
    'life_map',
    'search'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS analytics_cache_user_type_idx ON public.analytics_cache(user_id, type);
CREATE INDEX IF NOT EXISTS analytics_cache_updated_at_idx ON public.analytics_cache(updated_at DESC);
CREATE INDEX IF NOT EXISTS analytics_cache_expires_at_idx ON public.analytics_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_cache_owner_select ON public.analytics_cache
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY analytics_cache_owner_insert ON public.analytics_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY analytics_cache_owner_update ON public.analytics_cache
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY analytics_cache_owner_delete ON public.analytics_cache
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ARCS TABLE (Simplified for Analytics)
-- ============================================

CREATE TABLE IF NOT EXISTS public.arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  summary TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  color TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arcs_user_id_idx ON public.arcs(user_id);
CREATE INDEX IF NOT EXISTS arcs_dates_idx ON public.arcs(start_date, end_date);
CREATE INDEX IF NOT EXISTS arcs_user_dates_idx ON public.arcs(user_id, start_date DESC);

-- Enable Row Level Security
ALTER TABLE public.arcs ENABLE ROW LEVEL SECURITY;

CREATE POLICY arcs_owner_select ON public.arcs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY arcs_owner_insert ON public.arcs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY arcs_owner_update ON public.arcs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY arcs_owner_delete ON public.arcs
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ENHANCE INSIGHTS TABLE
-- ============================================

-- Add category and score fields if they don't exist (insights table may have different field names)
DO $$ 
BEGIN
  -- Check if 'category' column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'insights' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.insights ADD COLUMN category TEXT;
    -- Set category from insight_type if category is null
    UPDATE public.insights SET category = insight_type WHERE category IS NULL;
  END IF;
  
  -- Check if 'score' column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'insights' AND column_name = 'score'
  ) THEN
    ALTER TABLE public.insights ADD COLUMN score FLOAT;
    -- Set score from confidence if score is null
    UPDATE public.insights SET score = confidence WHERE score IS NULL;
  END IF;
END $$;

-- Add index for category
CREATE INDEX IF NOT EXISTS insights_category_idx ON public.insights(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS insights_score_idx ON public.insights(score DESC) WHERE score IS NOT NULL;

-- ============================================
-- ENHANCE CHARACTERS TABLE
-- ============================================

-- Add interaction_score and sentiment_toward if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'characters' AND column_name = 'interaction_score'
  ) THEN
    ALTER TABLE public.characters ADD COLUMN interaction_score FLOAT DEFAULT 0.0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'characters' AND column_name = 'sentiment_toward'
  ) THEN
    ALTER TABLE public.characters ADD COLUMN sentiment_toward FLOAT DEFAULT 0.0;
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS characters_interaction_score_idx ON public.characters(interaction_score DESC) WHERE interaction_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS characters_sentiment_toward_idx ON public.characters(sentiment_toward) WHERE sentiment_toward IS NOT NULL;

-- ============================================
-- TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for arcs table
CREATE TRIGGER arcs_updated_at
  BEFORE UPDATE ON public.arcs
  FOR EACH ROW
  EXECUTE FUNCTION update_analytics_updated_at();

-- Function to invalidate analytics cache when new memory is added
CREATE OR REPLACE FUNCTION invalidate_analytics_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all cached analytics for this user
  DELETE FROM public.analytics_cache WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to invalidate cache on new journal entry
CREATE TRIGGER journal_entries_invalidate_cache
  AFTER INSERT ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_analytics_cache();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.analytics_cache IS 'Caches expensive analytics computations. TTL: 6 hours or until new memory added.';
COMMENT ON TABLE public.arcs IS 'Life arcs detected by saga engine. Simplified structure for analytics.';
COMMENT ON COLUMN public.journal_entries.sentiment IS 'Sentiment score: -1.0 (very negative) to 1.0 (very positive)';
COMMENT ON COLUMN public.journal_entries.people IS 'Array of people mentioned in this entry';
COMMENT ON COLUMN public.characters.interaction_score IS 'Frequency and recency weighted interaction score';
COMMENT ON COLUMN public.characters.sentiment_toward IS 'Overall sentiment toward this character: -1.0 to 1.0';


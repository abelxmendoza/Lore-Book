-- Timeline & Chronology System Migration
-- Creates flexible timeline system with chronology support, multiple memberships, and cross-timeline relationships

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CHRONOLOGY ENHANCEMENT (journal_entries table)
-- ============================================================================

-- Add chronology fields to existing journal_entries table
ALTER TABLE public.journal_entries 
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_precision TEXT 
    CHECK (time_precision IN ('exact', 'day', 'month', 'year', 'approximate')) 
    DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS time_confidence NUMERIC(3,2) 
    CHECK (time_confidence BETWEEN 0 AND 1) DEFAULT 1.0;

-- Rename date to start_time for clarity (keeping date as alias for backward compatibility)
-- We'll keep both columns for now to avoid breaking existing code
-- ALTER TABLE public.journal_entries RENAME COLUMN date TO start_time;

-- Add index for chronology queries
CREATE INDEX IF NOT EXISTS journal_entries_time_range_idx 
  ON public.journal_entries(user_id, date, end_time) 
  WHERE end_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS journal_entries_time_precision_idx 
  ON public.journal_entries(user_id, time_precision);

-- ============================================================================
-- 2. TIMELINES TABLE (Flexible timeline system)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  timeline_type TEXT NOT NULL CHECK (timeline_type IN (
    'life_era', 'sub_timeline', 'skill', 'location', 'work', 'custom'
  )),
  parent_id UUID REFERENCES public.timelines(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for timelines
CREATE INDEX IF NOT EXISTS timelines_user_id_idx ON public.timelines(user_id);
CREATE INDEX IF NOT EXISTS timelines_parent_id_idx ON public.timelines(parent_id);
CREATE INDEX IF NOT EXISTS timelines_type_idx ON public.timelines(user_id, timeline_type);
CREATE INDEX IF NOT EXISTS timelines_dates_idx ON public.timelines(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS timelines_tags_idx ON public.timelines USING GIN(tags);
CREATE INDEX IF NOT EXISTS timelines_metadata_idx ON public.timelines USING GIN(metadata);

-- ============================================================================
-- 3. TIMELINE MEMBERSHIPS (Many-to-Many: memories ↔ timelines)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timeline_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL REFERENCES public.timelines(id) ON DELETE CASCADE,
  role TEXT, -- e.g., 'primary', 'secondary', 'context'
  importance_score NUMERIC(3,2) DEFAULT 0.5 CHECK (importance_score BETWEEN 0 AND 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, journal_entry_id, timeline_id)
);

-- Indexes for timeline_memberships
CREATE INDEX IF NOT EXISTS timeline_memberships_user_id_idx ON public.timeline_memberships(user_id);
CREATE INDEX IF NOT EXISTS timeline_memberships_entry_id_idx ON public.timeline_memberships(journal_entry_id);
CREATE INDEX IF NOT EXISTS timeline_memberships_timeline_id_idx ON public.timeline_memberships(timeline_id);
CREATE INDEX IF NOT EXISTS timeline_memberships_entry_timeline_idx 
  ON public.timeline_memberships(journal_entry_id, timeline_id);
CREATE INDEX IF NOT EXISTS timeline_memberships_timeline_entry_idx 
  ON public.timeline_memberships(timeline_id, journal_entry_id);

-- ============================================================================
-- 4. TIMELINE RELATIONSHIPS (Cross-timeline links)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timeline_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_timeline_id UUID NOT NULL REFERENCES public.timelines(id) ON DELETE CASCADE,
  target_timeline_id UUID NOT NULL REFERENCES public.timelines(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'spawned', 'influenced', 'overlapped', 'preceded', 'merged', 'split'
  )),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (source_timeline_id != target_timeline_id)
);

-- Indexes for timeline_relationships
CREATE INDEX IF NOT EXISTS timeline_relationships_user_id_idx ON public.timeline_relationships(user_id);
CREATE INDEX IF NOT EXISTS timeline_relationships_source_idx ON public.timeline_relationships(source_timeline_id);
CREATE INDEX IF NOT EXISTS timeline_relationships_target_idx ON public.timeline_relationships(target_timeline_id);
CREATE INDEX IF NOT EXISTS timeline_relationships_type_idx ON public.timeline_relationships(relationship_type);

-- ============================================================================
-- 5. CHRONOLOGY INDEX (Optimized time-based queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chronology_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  time_precision TEXT NOT NULL CHECK (time_precision IN ('exact', 'day', 'month', 'year', 'approximate')),
  year_bucket INTEGER NOT NULL, -- For fast year-based queries
  month_bucket DATE, -- First day of month for month queries
  decade_bucket INTEGER, -- For era-level queries
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, journal_entry_id)
);

-- Indexes for chronology_index
CREATE INDEX IF NOT EXISTS chronology_index_user_id_idx ON public.chronology_index(user_id);
CREATE INDEX IF NOT EXISTS chronology_index_entry_id_idx ON public.chronology_index(journal_entry_id);
CREATE INDEX IF NOT EXISTS chronology_index_time_range_idx 
  ON public.chronology_index(user_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS chronology_index_year_bucket_idx 
  ON public.chronology_index(user_id, year_bucket);
CREATE INDEX IF NOT EXISTS chronology_index_month_bucket_idx 
  ON public.chronology_index(user_id, month_bucket);
CREATE INDEX IF NOT EXISTS chronology_index_decade_bucket_idx 
  ON public.chronology_index(user_id, decade_bucket);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timelines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for timelines updated_at
DROP TRIGGER IF EXISTS update_timelines_timestamp ON public.timelines;
CREATE TRIGGER update_timelines_timestamp
  BEFORE UPDATE ON public.timelines
  FOR EACH ROW
  EXECUTE FUNCTION update_timelines_updated_at();

-- Function to compute chronology index buckets
CREATE OR REPLACE FUNCTION compute_chronology_buckets(
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
  year_bucket INTEGER,
  month_bucket DATE,
  decade_bucket INTEGER
) AS $$
BEGIN
  RETURN QUERY SELECT
    EXTRACT(YEAR FROM p_start_time)::INTEGER AS year_bucket,
    DATE_TRUNC('month', p_start_time)::DATE AS month_bucket,
    (EXTRACT(YEAR FROM p_start_time) / 10)::INTEGER * 10 AS decade_bucket;
END;
$$ LANGUAGE plpgsql;

-- Function to sync chronology_index when journal_entries are updated
CREATE OR REPLACE FUNCTION sync_chronology_index()
RETURNS TRIGGER AS $$
DECLARE
  v_buckets RECORD;
BEGIN
  -- Compute buckets
  SELECT * INTO v_buckets FROM compute_chronology_buckets(
    COALESCE(NEW.date, NEW.start_time, NOW()),
    COALESCE(NEW.end_time, NULL)
  );

  -- Insert or update chronology_index
  INSERT INTO public.chronology_index (
    user_id,
    journal_entry_id,
    start_time,
    end_time,
    time_precision,
    year_bucket,
    month_bucket,
    decade_bucket
  ) VALUES (
    NEW.user_id,
    NEW.id,
    COALESCE(NEW.date, NEW.start_time, NOW()),
    NEW.end_time,
    COALESCE(NEW.time_precision, 'exact'),
    v_buckets.year_bucket,
    v_buckets.month_bucket,
    v_buckets.decade_bucket
  )
  ON CONFLICT (user_id, journal_entry_id)
  DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    time_precision = EXCLUDED.time_precision,
    year_bucket = EXCLUDED.year_bucket,
    month_bucket = EXCLUDED.month_bucket,
    decade_bucket = EXCLUDED.decade_bucket;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-sync chronology_index
DROP TRIGGER IF EXISTS sync_chronology_index_trigger ON public.journal_entries;
CREATE TRIGGER sync_chronology_index_trigger
  AFTER INSERT OR UPDATE OF date, end_time, time_precision ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION sync_chronology_index();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chronology_index ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timelines
CREATE POLICY timelines_user_select ON public.timelines
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY timelines_user_insert ON public.timelines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY timelines_user_update ON public.timelines
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY timelines_user_delete ON public.timelines
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for timeline_memberships
CREATE POLICY timeline_memberships_user_select ON public.timeline_memberships
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY timeline_memberships_user_insert ON public.timeline_memberships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY timeline_memberships_user_update ON public.timeline_memberships
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY timeline_memberships_user_delete ON public.timeline_memberships
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for timeline_relationships
CREATE POLICY timeline_relationships_user_select ON public.timeline_relationships
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY timeline_relationships_user_insert ON public.timeline_relationships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY timeline_relationships_user_update ON public.timeline_relationships
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY timeline_relationships_user_delete ON public.timeline_relationships
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for chronology_index
CREATE POLICY chronology_index_user_select ON public.chronology_index
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.timelines IS 'Flexible timeline system supporting hierarchical and orthogonal timelines';
COMMENT ON COLUMN public.timelines.timeline_type IS 'Type of timeline: life_era, sub_timeline, skill, location, work, or custom';
COMMENT ON COLUMN public.timelines.parent_id IS 'Parent timeline for hierarchical nesting';

COMMENT ON TABLE public.timeline_memberships IS 'Many-to-many relationship between journal entries and timelines';
COMMENT ON COLUMN public.timeline_memberships.role IS 'Role of memory in timeline: primary, secondary, or context';
COMMENT ON COLUMN public.timeline_memberships.importance_score IS 'Importance score (0-1) of this memory within the timeline';

COMMENT ON TABLE public.timeline_relationships IS 'Cross-timeline relationships (causal, temporal, etc.)';
COMMENT ON COLUMN public.timeline_relationships.relationship_type IS 'Type: spawned, influenced, overlapped, preceded, merged, or split';

COMMENT ON TABLE public.chronology_index IS 'Optimized index for chronological queries with pre-computed time buckets';
COMMENT ON COLUMN public.chronology_index.year_bucket IS 'Year for fast year-based queries';
COMMENT ON COLUMN public.chronology_index.month_bucket IS 'First day of month for month-based queries';
COMMENT ON COLUMN public.chronology_index.decade_bucket IS 'Decade for era-level queries';

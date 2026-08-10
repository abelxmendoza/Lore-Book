-- Timeline Engine: Unified timeline events table
-- This migration extends the existing timeline_events table to support the unified timeline engine
-- The table normalizes all life events from various sources into a single timeline

DO $$
BEGIN
  IF to_regclass('public.timeline_events') IS NULL THEN
    RAISE NOTICE 'timeline_engine: timeline_events missing; skip alter/index until table exists';
    RETURN;
  END IF;

  -- Add source_type column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'source_type') THEN
    ALTER TABLE timeline_events ADD COLUMN source_type TEXT;
  END IF;

  -- Add source_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'source_id') THEN
    ALTER TABLE timeline_events ADD COLUMN source_id UUID;
  END IF;

  -- Add event_date column if it doesn't exist (use occurred_at as fallback)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'event_date') THEN
    ALTER TABLE timeline_events ADD COLUMN event_date TIMESTAMPTZ;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'occurred_at') THEN
      UPDATE timeline_events SET event_date = occurred_at WHERE event_date IS NULL;
    END IF;
  END IF;

  -- Add end_date column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'end_date') THEN
    ALTER TABLE timeline_events ADD COLUMN end_date TIMESTAMPTZ;
  END IF;

  -- Add metadata column if it doesn't exist (use context as fallback)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'metadata') THEN
    ALTER TABLE timeline_events ADD COLUMN metadata JSONB;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'context') THEN
      UPDATE timeline_events SET metadata = context WHERE metadata IS NULL AND context IS NOT NULL;
    END IF;
  END IF;

  -- Add confidence column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'confidence') THEN
    ALTER TABLE timeline_events ADD COLUMN confidence FLOAT DEFAULT 1.0;
  END IF;

  -- Set default source_type for existing records
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'task_id') THEN
    UPDATE timeline_events SET source_type = 'task' WHERE source_type IS NULL AND task_id IS NOT NULL;
  END IF;
  UPDATE timeline_events SET source_type = 'custom' WHERE source_type IS NULL;

  -- Set defaults for new records
  ALTER TABLE timeline_events ALTER COLUMN source_type SET DEFAULT 'custom';
  ALTER TABLE timeline_events ALTER COLUMN event_date SET DEFAULT NOW();
END $$;

-- Indexes / RLS / trigger only when table exists
DO $$
BEGIN
  IF to_regclass('public.timeline_events') IS NULL THEN
    RETURN;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_timeline_user_date ON timeline_events(user_id, COALESCE(event_date, occurred_at));
  CREATE INDEX IF NOT EXISTS idx_timeline_tags_gin ON timeline_events USING GIN(tags);
  CREATE INDEX IF NOT EXISTS idx_timeline_source ON timeline_events(source_id, source_type) WHERE source_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_timeline_source_type ON timeline_events(user_id, source_type);
  CREATE INDEX IF NOT EXISTS idx_timeline_date_range ON timeline_events(user_id, COALESCE(event_date, occurred_at), end_date) WHERE end_date IS NOT NULL;

  ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "timeline_events_self" ON timeline_events;
  CREATE POLICY "timeline_events_self" ON timeline_events
    FOR ALL
    USING (auth.uid() = user_id);
END $$;

CREATE OR REPLACE FUNCTION update_timeline_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.timeline_events') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS timeline_events_updated_at ON timeline_events;
  CREATE TRIGGER timeline_events_updated_at
    BEFORE UPDATE ON timeline_events
    FOR EACH ROW
    EXECUTE FUNCTION update_timeline_events_updated_at();
END $$;

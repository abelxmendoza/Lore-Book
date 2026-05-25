-- Timeline Engine: Unified timeline events table
-- This migration extends the existing timeline_events table to support the unified timeline engine
-- The table normalizes all life events from various sources into a single timeline

-- Add new columns to existing timeline_events table (if they don't exist)
DO $$ 
BEGIN
  -- Add source_type column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'timeline_events' AND column_name = 'source_type') THEN
    ALTER TABLE timeline_events ADD COLUMN source_type TEXT;
  END IF;

  -- Add source_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'timeline_events' AND column_name = 'source_id') THEN
    ALTER TABLE timeline_events ADD COLUMN source_id UUID;
  END IF;

  -- Add event_date column if it doesn't exist (use occurred_at as fallback)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'timeline_events' AND column_name = 'event_date') THEN
    ALTER TABLE timeline_events ADD COLUMN event_date TIMESTAMPTZ;
    -- Migrate existing occurred_at to event_date
    UPDATE timeline_events SET event_date = occurred_at WHERE event_date IS NULL;
  END IF;

  -- Add end_date column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'timeline_events' AND column_name = 'end_date') THEN
    ALTER TABLE timeline_events ADD COLUMN end_date TIMESTAMPTZ;
  END IF;

  -- Add metadata column if it doesn't exist (use context as fallback)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'timeline_events' AND column_name = 'metadata') THEN
    ALTER TABLE timeline_events ADD COLUMN metadata JSONB;
    -- Migrate existing context to metadata
    UPDATE timeline_events SET metadata = context WHERE metadata IS NULL AND context IS NOT NULL;
  END IF;

  -- Add confidence column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'timeline_events' AND column_name = 'confidence') THEN
    ALTER TABLE timeline_events ADD COLUMN confidence FLOAT DEFAULT 1.0;
  END IF;

  -- Set default source_type for existing records
  UPDATE timeline_events SET source_type = 'task' WHERE source_type IS NULL AND task_id IS NOT NULL;
  UPDATE timeline_events SET source_type = 'custom' WHERE source_type IS NULL;

  -- Set NOT NULL constraint on source_type for new records (after setting defaults)
  ALTER TABLE timeline_events ALTER COLUMN source_type SET DEFAULT 'custom';
  ALTER TABLE timeline_events ALTER COLUMN event_date SET DEFAULT NOW();
END $$;

-- Indexes for fast querying (create if they don't exist)
CREATE INDEX IF NOT EXISTS idx_timeline_user_date ON timeline_events(user_id, COALESCE(event_date, occurred_at));
CREATE INDEX IF NOT EXISTS idx_timeline_tags_gin ON timeline_events USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_timeline_source ON timeline_events(source_id, source_type) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_source_type ON timeline_events(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_timeline_date_range ON timeline_events(user_id, COALESCE(event_date, occurred_at), end_date) WHERE end_date IS NOT NULL;

-- Row Level Security
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timeline_events_self" ON timeline_events
  FOR ALL
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timeline_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER timeline_events_updated_at
  BEFORE UPDATE ON timeline_events
  FOR EACH ROW
  EXECUTE FUNCTION update_timeline_events_updated_at();



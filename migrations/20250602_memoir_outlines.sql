-- Create memoir_outlines table
CREATE TABLE IF NOT EXISTS memoir_outlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'My Memoir',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_update BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Table may already exist from 20240101000001 without sections/auto_update.
ALTER TABLE memoir_outlines ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '[]'::jsonb;
ALTER TABLE memoir_outlines ADD COLUMN IF NOT EXISTS auto_update BOOLEAN DEFAULT true;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_memoir_outlines_user_id ON memoir_outlines(user_id);

-- Enable RLS
ALTER TABLE memoir_outlines ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own memoir outlines" ON memoir_outlines;
DROP POLICY IF EXISTS "Users can insert their own memoir outlines" ON memoir_outlines;
DROP POLICY IF EXISTS "Users can update their own memoir outlines" ON memoir_outlines;
DROP POLICY IF EXISTS "Users can delete their own memoir outlines" ON memoir_outlines;

CREATE POLICY "Users can view their own memoir outlines"
  ON memoir_outlines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memoir outlines"
  ON memoir_outlines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memoir outlines"
  ON memoir_outlines FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memoir outlines"
  ON memoir_outlines FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_memoir_outlines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memoir_outlines_updated_at ON memoir_outlines;
CREATE TRIGGER memoir_outlines_updated_at
  BEFORE UPDATE ON memoir_outlines
  FOR EACH ROW
  EXECUTE FUNCTION update_memoir_outlines_updated_at();


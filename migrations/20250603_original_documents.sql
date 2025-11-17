-- Create original_documents table
CREATE TABLE IF NOT EXISTS original_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  language_style TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, file_name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_original_documents_user_id ON original_documents(user_id);

-- Enable RLS
ALTER TABLE original_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own original documents"
  ON original_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own original documents"
  ON original_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own original documents"
  ON original_documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own original documents"
  ON original_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_original_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER original_documents_updated_at
  BEFORE UPDATE ON original_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_original_documents_updated_at();

-- Add metadata column to memoir_outlines if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'memoir_outlines' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE memoir_outlines ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;


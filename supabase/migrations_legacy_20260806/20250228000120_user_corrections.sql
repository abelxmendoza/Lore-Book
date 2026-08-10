-- User Corrections Table
-- Purpose: Track user corrections to extractions for active learning
-- Expected Impact: Foundation for model improvement

CREATE TABLE IF NOT EXISTS user_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correction_type TEXT NOT NULL, -- 'entity', 'sentiment', 'relationship', 'extraction'
  original_value TEXT NOT NULL,
  corrected_value TEXT NOT NULL,
  context TEXT,
  source_message_id UUID,
  source_unit_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_for_training BOOLEAN DEFAULT FALSE,
  training_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_corrections_user_type ON user_corrections(user_id, correction_type);
CREATE INDEX IF NOT EXISTS idx_user_corrections_training ON user_corrections(used_for_training) WHERE used_for_training = FALSE;

COMMENT ON TABLE user_corrections IS 'User corrections to extractions for active learning';
COMMENT ON COLUMN user_corrections.correction_type IS 'Type of correction: entity, sentiment, relationship, extraction';
COMMENT ON COLUMN user_corrections.original_value IS 'Original extracted value';
COMMENT ON COLUMN user_corrections.corrected_value IS 'User-corrected value';
COMMENT ON COLUMN user_corrections.context IS 'Context where correction was made';
COMMENT ON COLUMN user_corrections.source_message_id IS 'ID of the message that triggered the extraction';
COMMENT ON COLUMN user_corrections.source_unit_id IS 'ID of the extracted unit that was corrected';
COMMENT ON COLUMN user_corrections.used_for_training IS 'Whether this correction has been used for training';

-- Training Datasets Table
-- Purpose: Store training datasets built from user corrections
-- Expected Impact: Data for fine-tuning models

CREATE TABLE IF NOT EXISTS training_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_type TEXT NOT NULL, -- 'entity', 'sentiment', 'relationship'
  data JSONB NOT NULL,
  sample_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_datasets_user_type ON training_datasets(user_id, dataset_type);

COMMENT ON TABLE training_datasets IS 'Training datasets built from user corrections';
COMMENT ON COLUMN training_datasets.dataset_type IS 'Type of dataset: entity, sentiment, relationship';
COMMENT ON COLUMN training_datasets.data IS 'Training data in JSONB format';
COMMENT ON COLUMN training_datasets.sample_count IS 'Number of samples in the dataset';

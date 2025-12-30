CREATE TABLE IF NOT EXISTS engine_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_engine_results_user_id ON engine_results(user_id);
CREATE INDEX IF NOT EXISTS idx_engine_results_updated_at ON engine_results(updated_at);

ALTER TABLE engine_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engine_results_self"
  ON engine_results FOR ALL
  USING (auth.uid() = user_id);


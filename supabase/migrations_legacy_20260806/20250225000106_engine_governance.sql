-- Engine Governance System
-- Tracks engine runs, health, and performance

-- Engine run history table
CREATE TABLE IF NOT EXISTS engine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_name TEXT NOT NULL,
  run_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  output_count INTEGER DEFAULT 0,
  avg_confidence NUMERIC(3, 2) DEFAULT 0.5,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_engine_runs_engine_name ON engine_runs(engine_name);
CREATE INDEX IF NOT EXISTS idx_engine_runs_run_time ON engine_runs(run_time DESC);
CREATE INDEX IF NOT EXISTS idx_engine_runs_user_id ON engine_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_engine_runs_success ON engine_runs(success);

-- RLS policies
ALTER TABLE engine_runs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own engine runs
CREATE POLICY "Users can view their own engine runs"
  ON engine_runs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (for monitoring)
CREATE POLICY "Service role can insert engine runs"
  ON engine_runs
  FOR INSERT
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE engine_runs IS 'Tracks engine execution history for health monitoring';
COMMENT ON COLUMN engine_runs.engine_name IS 'Name of the engine that ran';
COMMENT ON COLUMN engine_runs.duration_ms IS 'Execution duration in milliseconds';
COMMENT ON COLUMN engine_runs.success IS 'Whether the run succeeded';
COMMENT ON COLUMN engine_runs.output_count IS 'Number of outputs produced';
COMMENT ON COLUMN engine_runs.avg_confidence IS 'Average confidence of outputs (0.0-1.0)';

CREATE TABLE IF NOT EXISTS cognitive_distortions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  evidence TEXT NOT NULL,
  trigger_phrase TEXT,
  severity FLOAT,
  confidence FLOAT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cognitive_distortions_user_id ON cognitive_distortions(user_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_distortions_timestamp ON cognitive_distortions(timestamp);
CREATE INDEX IF NOT EXISTS idx_cognitive_distortions_type ON cognitive_distortions(type);

ALTER TABLE cognitive_distortions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_distortions"
  ON cognitive_distortions
  USING (auth.uid() = user_id);


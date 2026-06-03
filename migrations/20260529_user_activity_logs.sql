-- User activity logs: login history, profile changes, key account events

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  device      TEXT,
  location    TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_activity_logs_user_id_idx   ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS user_activity_logs_timestamp_idx ON user_activity_logs(timestamp DESC);

ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read their own logs; server-side admin inserts them
CREATE POLICY "Users can read own activity logs"
  ON user_activity_logs FOR SELECT
  USING (auth.uid() = user_id);

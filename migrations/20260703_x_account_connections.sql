CREATE TABLE IF NOT EXISTS external_account_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  provider_username TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS external_account_connections_provider_idx
  ON external_account_connections (provider, updated_at DESC);

CREATE INDEX IF NOT EXISTS external_account_connections_user_idx
  ON external_account_connections (user_id, provider);

ALTER TABLE external_account_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own external account connections"
  ON external_account_connections FOR SELECT
  USING (auth.uid() = user_id);

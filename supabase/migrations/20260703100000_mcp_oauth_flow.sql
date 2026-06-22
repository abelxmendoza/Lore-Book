-- MCP OAuth 2.1 authorization codes + refresh tokens (ChatGPT / third-party clients)

CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{memory:read}',
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_codes_client_idx
  ON mcp_oauth_authorization_codes (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_oauth_codes_expires_idx
  ON mcp_oauth_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{memory:read}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_user_idx
  ON mcp_oauth_refresh_tokens (user_id, client_id);

ALTER TABLE mcp_oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Service role inserts only; no user-facing policies on codes/tokens

-- Platform ChatGPT client (public, PKCE-only)
INSERT INTO mcp_oauth_clients (
  client_id,
  client_name,
  client_type,
  redirect_uris,
  allowed_scopes,
  metadata
) VALUES (
  'chatgpt-mcp',
  'ChatGPT',
  'public',
  ARRAY[
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'https://chat.openai.com/connector_platform_oauth_redirect',
    'https://chat.openai.com/aip/connectors/oauth/callback'
  ],
  ARRAY['memory:read', 'memory:write', 'entity:write'],
  '{"platform":"openai","connector":true}'::jsonb
) ON CONFLICT (client_id) DO UPDATE SET
  redirect_uris = EXCLUDED.redirect_uris,
  allowed_scopes = EXCLUDED.allowed_scopes,
  metadata = EXCLUDED.metadata;

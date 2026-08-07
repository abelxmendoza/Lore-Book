-- LoreBook MCP memory platform tables (audit, OAuth clients, tool versions, events)

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('public', 'confidential')),
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  allowed_scopes TEXT[] NOT NULL DEFAULT '{memory:read}',
  owner_user_id UUID REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mcp_tool_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_version TEXT NOT NULL DEFAULT '1',
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_artifact_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'denied', 'rate_limited')),
  error_code TEXT,
  latency_ms INT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_audit_user_time_idx
  ON mcp_tool_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_audit_tool_idx
  ON mcp_tool_audit_log (tool_name, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_tool_versions (
  tool_name TEXT NOT NULL,
  version TEXT NOT NULL,
  schema JSONB NOT NULL,
  deprecated_at TIMESTAMPTZ,
  sunset_at TIMESTAMPTZ,
  PRIMARY KEY (tool_name, version)
);

CREATE TABLE IF NOT EXISTS mcp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_events_aggregate_idx
  ON mcp_events (user_id, aggregate_type, aggregate_id, created_at);

ALTER TABLE mcp_tool_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_audit_own ON mcp_tool_audit_log;
CREATE POLICY mcp_audit_own ON mcp_tool_audit_log
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS mcp_events_own ON mcp_events;
CREATE POLICY mcp_events_own ON mcp_events
  FOR SELECT USING (user_id = auth.uid());

-- Seed v1 tool version metadata (schemas are enforced in server code)
INSERT INTO mcp_tool_versions (tool_name, version, schema) VALUES
  ('search_memories', '1', '{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer"},"date_from":{"type":"string"},"date_to":{"type":"string"}},"required":["query"]}'::jsonb),
  ('search_entities', '1', '{"type":"object","properties":{"query":{"type":"string"},"types":{"type":"array","items":{"type":"string"}},"limit":{"type":"integer"}},"required":["query"]}'::jsonb),
  ('get_entity', '1', '{"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}'::jsonb),
  ('get_timeline', '1', '{"type":"object","properties":{"start_date":{"type":"string"},"end_date":{"type":"string"},"entity_id":{"type":"string"}},"required":["start_date","end_date"]}'::jsonb),
  ('get_relationships', '1', '{"type":"object","properties":{"entity_id":{"type":"string"},"direction":{"type":"string","enum":["outbound","inbound","both"]}},"required":["entity_id"]}'::jsonb)
ON CONFLICT (tool_name, version) DO NOTHING;

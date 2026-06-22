import type { AuthUser } from '../types/runtime/express';

export const MCP_TOOL_VERSION = '1';

export const MCP_SERVER_INSTRUCTIONS = `LoreBook MCP exposes the user's personal memory graph. Always call search_memories or search_entities before asserting facts. Prefer get_entity + get_relationships over guessing. All results include provenance sources; cite them in responses. Write tools require explicit user intent (not available in v1 read-only mode).`;

export type ProvenanceSource = {
  artifact_type: string;
  artifact_id: string;
  relation: string;
  confidence?: number;
  excerpt?: string;
  occurred_at?: string;
};

export type ProvenanceBundle = {
  sources: ProvenanceSource[];
  truth_state?: string;
};

export type McpToolResult<T> = {
  ok: boolean;
  data: T;
  provenance: ProvenanceBundle;
  tool_version: string;
  request_id: string;
};

export type McpAuthContext = {
  user: AuthUser;
  clientId: string;
  requestId: string;
  scopes: string[];
  ipHash?: string;
};

export type McpAuditStatus = 'ok' | 'error' | 'denied' | 'rate_limited';

export type SearchMemoriesInput = {
  query: string;
  limit?: number;
  date_from?: string;
  date_to?: string;
  _version?: string;
};

export type SearchEntitiesInput = {
  query: string;
  types?: string[];
  limit?: number;
  _version?: string;
};

export type GetEntityInput = {
  id: string;
  _version?: string;
};

export type GetTimelineInput = {
  start_date: string;
  end_date: string;
  entity_id?: string;
  _version?: string;
};

export type GetRelationshipsInput = {
  entity_id: string;
  direction?: 'outbound' | 'inbound' | 'both';
  _version?: string;
};

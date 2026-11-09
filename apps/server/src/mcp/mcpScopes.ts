/**
 * MCP scope enforcement — the single place that decides which tools a
 * token's scopes unlock.
 *
 * Before this module existed, scopes were decorative: every authenticated
 * context got all 7 tools registered, and neither write handler checked
 * `ctx.scopes`, so a token granted only `memory:read` (e.g. the ChatGPT
 * app, whose submission declares "All tools are read-only") could call
 * `ingest_story` and `correct_lore`. Enforcement now happens twice:
 *
 * 1. Registration time (`mcpServerFactory`): a tool the context's scopes
 *    don't cover is never registered, so it does not appear in
 *    `tools/list` and cannot be called through the protocol.
 * 2. Handler time (`mcpLoreIngest` / `mcpLoreCorrect`): the handler
 *    re-checks defensively, so a direct in-process call with an
 *    under-scoped context is denied (and audit-logged) too.
 */

import type { McpAuthContext } from './types';

export const MCP_SCOPE_READ = 'memory:read';
export const MCP_SCOPE_WRITE = 'memory:write';
export const MCP_SCOPE_ENTITY_WRITE = 'entity:write';

/** Scopes each tool requires. Read tools need `memory:read` (already
 *  enforced for every MCP request by `mcpAuthMiddleware`). */
export const MCP_TOOL_REQUIRED_SCOPES: Record<string, readonly string[]> = {
  search_memories: [MCP_SCOPE_READ],
  search_entities: [MCP_SCOPE_READ],
  get_entity: [MCP_SCOPE_READ],
  get_timeline: [MCP_SCOPE_READ],
  get_relationships: [MCP_SCOPE_READ],
  ingest_story: [MCP_SCOPE_WRITE],
  correct_lore: [MCP_SCOPE_WRITE, MCP_SCOPE_ENTITY_WRITE],
};

/**
 * Scopes granted to a first-party Supabase session JWT used as an MCP
 * bearer token. Session tokens authenticate the user, but they carry no
 * OAuth grant, so they are read-only over MCP by design: writes require
 * an OAuth access token whose grant explicitly includes the write
 * scopes. Scopes and client identity for this path are derived
 * server-side here — never from caller-supplied headers.
 */
export const MCP_SESSION_TOKEN_SCOPES: readonly string[] = [MCP_SCOPE_READ];

/** Client id recorded for the Supabase-session auth path (no OAuth client). */
export const MCP_SESSION_CLIENT_ID = 'lorebook-session';

export function missingScopes(ctx: McpAuthContext, toolName: string): string[] {
  const required = MCP_TOOL_REQUIRED_SCOPES[toolName] ?? [];
  const granted = new Set(ctx.scopes ?? []);
  return required.filter((scope) => !granted.has(scope));
}

export function hasToolScopes(ctx: McpAuthContext, toolName: string): boolean {
  return missingScopes(ctx, toolName).length === 0;
}

export function insufficientScopeMessage(toolName: string, missing: string[]): string {
  return `Insufficient scope for ${toolName}: missing ${missing.join(', ')}`;
}

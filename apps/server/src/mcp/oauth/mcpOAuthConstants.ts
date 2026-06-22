export const MCP_OAUTH_SCOPES = [
  'memory:read',
  'memory:write',
  'entity:write',
  'memory:admin',
] as const;

export type McpOAuthScope = (typeof MCP_OAUTH_SCOPES)[number];

export const DEFAULT_MCP_OAUTH_SCOPES: McpOAuthScope[] = ['memory:read'];

export function parseScopeString(scope: string | undefined): McpOAuthScope[] {
  if (!scope?.trim()) return [...DEFAULT_MCP_OAUTH_SCOPES];
  const parts = scope.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const allowed = new Set<string>(MCP_OAUTH_SCOPES);
  return parts.filter((s): s is McpOAuthScope => allowed.has(s));
}

export function scopesToString(scopes: string[]): string {
  return [...new Set(scopes)].join(' ');
}

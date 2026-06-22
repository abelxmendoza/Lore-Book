/**
 * Stdio MCP entry for local clients (Cursor, Claude Desktop).
 * Usage: ENABLE_MCP=true MCP_DEV_USER_ID=<uuid> npm run mcp:stdio -w server
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServerForUser } from './mcpServerFactory';
import type { McpAuthContext } from './types';

const userId =
  process.env.MCP_DEV_USER_ID?.trim() ||
  '00000000-0000-0000-0000-000000000000';

const ctx: McpAuthContext = {
  user: {
    id: userId,
    email: 'mcp-stdio@local',
    lastSignInAt: new Date().toISOString(),
    fullName: 'MCP Stdio Dev',
  },
  clientId: 'lorebook-stdio',
  requestId: `stdio-${Date.now()}`,
  scopes: ['memory:read', 'memory:write', 'entity:write'],
};

async function main(): Promise<void> {
  const server = createMcpServerForUser(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP stdio server failed:', error);
  process.exit(1);
});

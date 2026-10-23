import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { logger } from '../logger';

import { mcpAuthMiddleware } from '../mcp/mcpAuth';
import { mcpChatGptIpAllowlistMiddleware } from '../mcp/mcpChatGptIpAllowlist';
import { mcpRateLimitMiddleware } from '../mcp/mcpRateLimit';
import { createMcpServerForUser } from '../mcp/mcpServerFactory';

export const mcpRouter = Router();

mcpRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lorebook-mcp', version: '1.1.0' });
});

/**
 * ChatGPT connector egress allowlist stays on for the ChatGPT OAuth client.
 * Hivemind and other propose-scoped agents call from the user's own machines,
 * so they must not be rejected for not originating at OpenAI.
 */
function mcpClientIpGate(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
): void {
  const ctx = req.mcpContext;
  const agentWriter = ctx?.clientId === 'hivemind' || ctx?.scopes?.includes('memory:propose');
  if (agentWriter) {
    next();
    return;
  }
  void mcpChatGptIpAllowlistMiddleware(req, res, next);
}

async function handleMcpRequest(
  req: import('express').Request,
  res: import('express').Response
): Promise<void> {
  const ctx = req.mcpContext;
  if (!ctx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createMcpServerForUser(ctx);

  res.on('close', () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error({ error, requestId: ctx.requestId }, 'MCP request failed');
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP transport error' });
    }
  }
}

mcpRouter.post('/', mcpAuthMiddleware, mcpClientIpGate, mcpRateLimitMiddleware, (req, res) => {
  void handleMcpRequest(req, res);
});

mcpRouter.get('/', mcpAuthMiddleware, mcpClientIpGate, mcpRateLimitMiddleware, (req, res) => {
  void handleMcpRequest(req, res);
});

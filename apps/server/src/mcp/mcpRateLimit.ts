/**
 * OpenAI-style rate limit headers + tiered MCP limits.
 * Spec: docs/mcp-memory-platform.md §5; OpenAI rate limit header conventions.
 */
import type { NextFunction, Request, Response } from 'express';

import { config } from '../config';
import {
  checkRateLimit,
  createRateLimitStore,
  type RateLimitStore,
} from '../lib/rateLimitCore';
import { checkPostgresRateLimit } from '../services/postgresRateLimitService';
import { getCurrentUsage } from '../services/usageTracking';

import { auditMcpToolCall } from './mcpAuditService';

const WINDOW_MS = 60_000;
const store: RateLimitStore = createRateLimitStore();

export type McpRateTier = 'free' | 'premium';

export function resolveMcpReadRpm(tier: McpRateTier): number {
  return tier === 'premium' ? config.mcpReadRpmPremium : config.mcpReadRpmFree;
}

function clientId(req: Request): string {
  return (
    (req.headers['x-mcp-client-id'] as string | undefined)?.trim() ||
    (req.headers['mcp-client-id'] as string | undefined)?.trim() ||
    'lorebook-mcp'
  );
}

function bucketKey(userId: string, clientIdValue: string): string {
  return `mcp:${userId}:${clientIdValue}:read`;
}

function formatResetSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m0s`;
}

export function setMcpRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  retryAfterSec: number
): void {
  res.setHeader('x-ratelimit-limit-requests', String(limit));
  res.setHeader('x-ratelimit-remaining-requests', String(Math.max(0, remaining)));
  res.setHeader('x-ratelimit-reset-requests', formatResetSeconds(retryAfterSec));
  if (remaining <= 0) {
    res.setHeader('Retry-After', String(retryAfterSec));
  }
}

function jsonRpcRateLimitResponse(req: Request, retryAfterSec: number): object {
  const body = req.body as { id?: string | number | null } | undefined;
  return {
    jsonrpc: '2.0',
    error: {
      code: -32029,
      message: 'Rate limit exceeded',
      data: { retryAfter: retryAfterSec },
    },
    id: body?.id ?? null,
  };
}

export async function resolveMcpRateTier(userId: string): Promise<McpRateTier> {
  const usage = await getCurrentUsage(userId);
  return usage.isPremium ? 'premium' : 'free';
}

export async function checkMcpRateLimit(
  userId: string,
  clientIdValue: string,
  tier: McpRateTier
): Promise<
  | { allowed: true; limit: number; remaining: number; resetSec: number }
  | { allowed: false; limit: number; remaining: 0; resetSec: number }
> {
  const limit = resolveMcpReadRpm(tier);
  const key = bucketKey(userId, clientIdValue);

  const pg = await checkPostgresRateLimit(key, limit, WINDOW_MS);
  const result = pg ?? checkRateLimit(store, key, limit, WINDOW_MS);

  if (!result.allowed) {
    return { allowed: false, limit, remaining: 0, resetSec: result.retryAfterSec };
  }

  const record = store.get(key);
  const used = record?.count ?? 1;
  const resetSec = record
    ? Math.max(1, Math.ceil((record.resetTime - Date.now()) / 1000))
    : 60;

  return { allowed: true, limit, remaining: limit - used, resetSec };
}

export function resetMcpRateLimitsForTests(): void {
  store.clear();
}

export async function mcpRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const cid = clientId(req);
  const tier = await resolveMcpRateTier(userId);
  const check = await checkMcpRateLimit(userId, cid, tier);

  setMcpRateLimitHeaders(res, check.limit, check.remaining, check.resetSec);

  if (check.allowed) {
    next();
    return;
  }

  if (req.mcpContext) {
    void auditMcpToolCall({
      ctx: req.mcpContext,
      toolName: 'mcp.request',
      input: { method: req.method, clientId: cid, tier },
      status: 'rate_limited',
      latencyMs: 0,
      errorCode: 'rate_limit_exceeded',
    });
  }

  res.setHeader('Retry-After', String(check.resetSec));
  const payload = {
    error: 'Rate limit exceeded',
    message: `MCP read limit is ${check.limit} requests per minute (${tier} tier)`,
    tier,
    retryAfter: check.resetSec,
  };

  if (req.method === 'POST') {
    res.status(429).json(jsonRpcRateLimitResponse(req, check.resetSec));
    return;
  }

  res.status(429).json(payload);
}

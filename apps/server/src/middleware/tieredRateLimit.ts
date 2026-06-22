import type { Request, Response, NextFunction } from 'express';

import {
  checkRateLimit,
  createRateLimitStore,
  type RateLimitStore,
} from '../lib/rateLimitCore';
import { logSecurityEvent } from '../services/securityLog';
import { checkPostgresRateLimit } from '../services/postgresRateLimitService';

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_MIN = 60 * 1000;

const isDevelopment = () =>
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test' ||
  (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

const isRateLimitDisabled = () =>
  isDevelopment() && process.env.DISABLE_RATE_LIMIT === 'true';

export type ApiRateTier =
  | 'read'
  | 'write'
  | 'write_burst'
  | 'ai'
  | 'compute'
  | 'auth_sensitive'
  | 'webhook'
  | 'guest'
  | 'public_probe';

type TierRule = { tier: ApiRateTier; max: number; windowMs: number };

/** Production limits per tier (per user id or IP). */
const TIER_LIMITS: Record<ApiRateTier, { max: number; windowMs: number }> = {
  read: { max: 1200, windowMs: FIFTEEN_MIN },
  write: { max: 300, windowMs: FIFTEEN_MIN },
  write_burst: { max: 90, windowMs: ONE_MIN },
  ai: { max: 45, windowMs: FIFTEEN_MIN },
  compute: { max: 35, windowMs: FIFTEEN_MIN },
  auth_sensitive: { max: 12, windowMs: FIFTEEN_MIN },
  webhook: { max: 120, windowMs: FIFTEEN_MIN },
  guest: { max: 20, windowMs: FIFTEEN_MIN },
  public_probe: { max: 30, windowMs: FIFTEEN_MIN },
};

const store: RateLimitStore = createRateLimitStore();

const SKIP_PATHS = [
  /^\/api\/health\/?$/,
  /^\/api\/health\/db\/?$/,
  /^\/health\/?$/,
];

const AI_PATH =
  /\/api\/(chat(\/stream|\/?$)|lexical\/(preview|analyze|debug)|onboarding\/(analyze-user|detect-personas)|chapters\/extract-info|characters\/extract-from-chat)/i;

const COMPUTE_PATH =
  /\/api\/.*(rescan|rebuild|backfill|recompute|batch|sync-all|train\/|infer|lexical-rescan|classify-backfill|graph-recovery|run-now)/i;

const AUTH_SENSITIVE_PATH =
  /\/api\/(subscription\/create|account\/delete|user\/(signup|register|reset-password|change-password))/i;

const WEBHOOK_PATH = /\/api\/(subscription\/webhook|webhooks\/openai)/i;
const GUEST_PATH = /\/api\/guest/i;
const PUBLIC_PROBE_PATH = /\/api\/(diagnostics|runtime)\/?$/i;

function requestPath(req: Request): string {
  return (req.originalUrl ?? req.url ?? req.path ?? '').split('?')[0];
}

function shouldSkip(path: string): boolean {
  return SKIP_PATHS.some((re) => re.test(path));
}

function getClientId(req: Request): string {
  return (req as Request & { user?: { id?: string } }).user?.id || req.ip || 'anonymous';
}

function resolveTierRules(req: Request): TierRule[] {
  const path = requestPath(req);
  if (shouldSkip(path)) return [];

  const method = req.method.toUpperCase();
  const rules: TierRule[] = [];

  if (WEBHOOK_PATH.test(path)) {
    rules.push({ tier: 'webhook', ...TIER_LIMITS.webhook });
    return rules;
  }
  if (GUEST_PATH.test(path)) {
    rules.push({ tier: 'guest', ...TIER_LIMITS.guest });
    return rules;
  }
  if (PUBLIC_PROBE_PATH.test(path)) {
    rules.push({ tier: 'public_probe', ...TIER_LIMITS.public_probe });
    return rules;
  }
  if (AUTH_SENSITIVE_PATH.test(path)) {
    rules.push({ tier: 'auth_sensitive', ...TIER_LIMITS.auth_sensitive });
  }
  if (AI_PATH.test(path)) {
    rules.push({ tier: 'ai', ...TIER_LIMITS.ai });
  }
  if (COMPUTE_PATH.test(path)) {
    rules.push({ tier: 'compute', ...TIER_LIMITS.compute });
  }

  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  if (isRead) {
    rules.push({ tier: 'read', ...TIER_LIMITS.read });
  } else {
    rules.push({ tier: 'write', ...TIER_LIMITS.write });
    rules.push({ tier: 'write_burst', ...TIER_LIMITS.write_burst });
  }

  return rules;
}

async function enforceTier(
  req: Request,
  res: Response,
  rule: TierRule
): Promise<boolean> {
  const clientId = getClientId(req);
  const bucketKey = `${clientId}:${rule.tier}`;
  const max = isDevelopment() ? 10_000 : rule.max;

  const pg = await checkPostgresRateLimit(bucketKey, max, rule.windowMs);
  const result =
    pg ??
    checkRateLimit(store, bucketKey, max, rule.windowMs);

  if (result.allowed) return true;

  logSecurityEvent('rate_limit_exceeded', {
    ip: req.ip,
    path: requestPath(req),
    tier: rule.tier,
    clientId: clientId.substring(0, 8),
    userAgent: req.headers['user-agent'] || 'unknown',
  });

  res.setHeader('Retry-After', String(result.retryAfterSec));
  res.status(429).json({
    error: 'Too many requests',
    message: `Rate limit exceeded (${rule.tier}). Please try again later.`,
    tier: rule.tier,
    retryAfter: result.retryAfterSec,
  });
  return false;
}

/**
 * Global tiered rate limiter — covers ALL /api routes (public + protected).
 * Free in-memory by default; optional Supabase Postgres via RATE_LIMIT_BACKEND=postgres.
 */
export async function tieredRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (isRateLimitDisabled()) return next();

  const path = requestPath(req);
  if (shouldSkip(path)) return next();

  const rules = resolveTierRules(req);
  for (const rule of rules) {
    const ok = await enforceTier(req, res, rule);
    if (!ok) return;
  }
  next();
}

/** Sync wrapper for Express (handles async rejections). */
export function tieredRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  tieredRateLimitMiddleware(req, res, next).catch(next);
}

/** @internal test helper */
export function resolveApiRateTierRulesForTests(req: Request): TierRule[] {
  return resolveTierRules(req);
}

import type { Request, Response, NextFunction } from 'express';

import { isDevelopmentRuntime } from '../config/runtimePolicy';
import {
  checkRateLimit,
  createRateLimitStore,
  type RateLimitStore,
} from '../lib/rateLimitCore';
import { getRateLimitClientId } from '../lib/rateLimitClientId';
import { logSecurityEvent } from '../services/securityLog';
import { checkPostgresRateLimit } from '../services/postgresRateLimitService';

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_MIN = 60 * 1000;

const isDevelopment = () =>
  process.env.NODE_ENV === 'test' ||
  isDevelopmentRuntime();

const isRateLimitDisabled = () =>
  process.env.DISABLE_RATE_LIMIT === 'true' ||
  process.env.RATE_LIMIT_DISABLED === 'true';

export type ApiRateTier =
  | 'read'
  | 'write'
  | 'write_burst'
  | 'ai'
  | 'compute'
  | 'book_query'
  | 'auth_sensitive'
  | 'webhook'
  | 'guest'
  | 'public_probe';

type TierRule = { tier: ApiRateTier; max: number; windowMs: number };

/**
 * Production limits per tier (per user id or IP).
 *
 * `read` must tolerate SPA cold-start fan-out: Omni Timeline / Books / Story
 * fire dozens of GETs at once, often from phone + desktop in parallel. A
 * 1200/15m ceiling was starving legitimate sessions into wall-to-wall 429s
 * while /api/health stayed green.
 */
const TIER_LIMITS: Record<ApiRateTier, { max: number; windowMs: number }> = {
  // SPA cold-start + multi-tab fan-out easily exceeds a few thousand GETs.
  read: { max: 100_000, windowMs: FIFTEEN_MIN },
  write: { max: 5_000, windowMs: FIFTEEN_MIN },
  write_burst: { max: 1_200, windowMs: ONE_MIN },
  // Real chat completions only (not composer preview). ~1 msg / 5s average.
  ai: { max: 180, windowMs: FIFTEEN_MIN },
  compute: { max: 50, windowMs: FIFTEEN_MIN },
  // Grounded book compilers (load-then-slice) — tighter than generic writes.
  book_query: { max: 120, windowMs: FIFTEEN_MIN },
  auth_sensitive: { max: 20, windowMs: FIFTEEN_MIN },
  webhook: { max: 120, windowMs: FIFTEEN_MIN },
  guest: { max: 40, windowMs: FIFTEEN_MIN },
  public_probe: { max: 60, windowMs: FIFTEEN_MIN },
};

const store: RateLimitStore = createRateLimitStore();

const SKIP_PATHS = [
  /^\/api\/health\/?$/,
  /^\/api\/health\/db\/?$/,
  /^\/health\/?$/,
  // Auth bootstrap — must never 429 or the SPA cannot recover (CSRF + role gate).
  /^\/api\/security\/csrf-token\/?$/i,
  /^\/api\/user\/authority\/?$/i,
  /^\/api\/user\/terms-status\/?$/i,
  // Composer / home cold-start — failing these leaves the SPA stuck.
  /^\/api\/entities\/certified-index\/?$/i,
  /^\/api\/conversation\/threads\/[^/]+\/messages\/?$/i,
  /^\/api\/conversation\/threads\/[^/]+\/ensure-visible\/?$/i,
  /^\/api\/chat\/return-point\/?$/i,
  /^\/api\/subscription\/status\/?$/i,
  /^\/api\/user\/activity\/?$/i,
  /^\/api\/books\/(characters|skills)\/?$/i,
  /^\/api\/biography\/(living|readiness(?:\/.*)?)\/?$/i,
];

/**
 * Normalize paths for skip/tier matching.
 * `app.use('/api', …)` leaves `req.url`/`req.path` without the `/api` prefix;
 * prefer `originalUrl`, but accept stripped forms too.
 */
function requestPath(req: Request): string {
  const raw = (req.originalUrl ?? req.url ?? req.path ?? '').split('?')[0] || '';
  if (raw.startsWith('/api/') || raw === '/api' || raw.startsWith('/health')) return raw;
  if (req.baseUrl === '/api' || raw.startsWith('/')) {
    const rel = raw.startsWith('/') ? raw : `/${raw}`;
    if (!rel.startsWith('/api')) return `/api${rel === '/' ? '' : rel}`;
  }
  return raw;
}

/** CORS preflights must not consume the read budget. */
function isCorsPreflight(req: Request): boolean {
  return req.method.toUpperCase() === 'OPTIONS';
}

// LLM / paid-model routes only. Do NOT include composer lexical preview —
// it is local pattern matching and fires on a 280ms debounce while typing.
const AI_PATH =
  /\/api\/(chat(\/stream|\/?$)|lexical\/(analyze|debug)|onboarding\/(analyze-user|detect-personas)|chapters\/extract-info|characters\/extract-from-chat)/i;

const COMPUTE_PATH =
  /\/api\/.*(rescan|rebuild|backfill|recompute|batch|sync-all|train\/|infer|lexical-rescan|classify-backfill|graph-recovery|run-now)/i;

/** Grounded Ask / book compilers — expensive load-then-slice paths. */
const BOOK_QUERY_PATH =
  /\/api\/(entities\/query|locations\/query|organizations\/query|projects\/query|skills\/query|quests\/query|family\/query|romantic-relationships\/query)\/?$/i;

const AUTH_SENSITIVE_PATH =
  /\/api\/(subscription\/create|account\/delete|user\/(signup|register|reset-password|change-password))/i;

const WEBHOOK_PATH = /\/api\/(subscription\/webhook|webhooks\/openai)/i;
const GUEST_PATH = /\/api\/guest/i;
const PUBLIC_PROBE_PATH = /\/api\/(diagnostics|runtime)\/?$/i;

/**
 * High-frequency composer helpers (debounced ~280ms while typing).
 * They already have dedicated per-route limiters (lexicalPreviewLimit /
 * loreBookParseLimit ≈ 900/15m, keyed after auth).
 *
 * Do NOT count them against the shared write / write_burst / ai tiers —
 * sustained journaling drains a 450/15m write bucket in ~1–2 minutes, then
 * POST /api/chat/stream 429s with "Cloud sync failed" even though chat
 * itself was not overused.
 */
const COMPOSER_HOT_PATH =
  /\/api\/(lexical\/preview|conversation\/lorebook-parse)\/?$/i;

/**
 * Real chat sends already have dedicated caps:
 *   - tiered `ai` (180/15m)
 *   - chatStreamHttpLimit (180/15m) + chatStreamBurstLimit (45/1m)
 *
 * Do NOT also charge the shared write / write_burst buckets. Postgres-backed
 * write windows persist across deploys; once a typing session (or any other
 * write traffic) fills `write`, chat stays 429'd for up to 15 minutes even
 * after composer hot paths are excluded.
 */
const CHAT_SEND_PATH = /\/api\/chat(\/stream)?\/?$/i;

/**
 * Thread activity bumps (PATCH …/threads/:id with touchActivity) fire on every
 * send and must not drain write_burst — otherwise the follow-up chat send's
 * parallel activity ping 429s and the UI looks like "2nd message always fails".
 */
const THREAD_ACTIVITY_PATH =
  /\/api\/(conversation\/)?threads\/[^/]+\/?$/i;

function shouldSkip(path: string): boolean {
  return SKIP_PATHS.some((re) => re.test(path));
}

function getClientId(req: Request): string {
  return getRateLimitClientId(req);
}

function resolveTierRules(req: Request): TierRule[] {
  const path = requestPath(req);
  const method = req.method.toUpperCase();
  if (shouldSkip(path) || isCorsPreflight(req)) return [];

  // Composer previews are capped by route middleware only.
  if (COMPOSER_HOT_PATH.test(path)) return [];

  // Cheap thread activity bumps — do not share the write budget with chat.
  if (method === 'PATCH' && THREAD_ACTIVITY_PATH.test(path)) return [];

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

  // Book query POSTs: dedicated budget, do not also drain write_burst.
  if (method === 'POST' && BOOK_QUERY_PATH.test(path)) {
    rules.push({ tier: 'book_query', ...TIER_LIMITS.book_query });
    return rules;
  }

  const isRead = method === 'GET' || method === 'HEAD';
  if (isRead) {
    rules.push({ tier: 'read', ...TIER_LIMITS.read });
  } else if (!CHAT_SEND_PATH.test(path)) {
    // Chat sends: ai tier only (plus dedicated chatStream* limiters). See CHAT_SEND_PATH.
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
  if (shouldSkip(path) || isCorsPreflight(req)) return next();

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

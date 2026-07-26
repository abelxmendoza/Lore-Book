import type { RequestHandler } from 'express';

import { config } from '../config';
import { requireDevAccess } from './rbac';
import { createRateLimiter } from './rateLimit';

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_MIN = 60 * 1000;

/**
 * Shared budget for non-chat OpenAI HTTP helpers (extract-from-chat, chapter
 * extract, onboarding analyze). Kept separate from chat sends so background
 * extraction cannot lock the user out of conversation.
 */
export const openAiHttpLimit = createRateLimiter(60, FIFTEEN_MIN, 'openai_http');

/** Burst guard for non-chat OpenAI HTTP helpers — 20 / minute */
export const openAiHttpBurstLimit = createRateLimiter(20, ONE_MIN, 'openai_http_burst');

/**
 * Real chat sends only (`POST /api/chat` + `/api/chat/stream`).
 * Must stay independent of extract/onboarding so a normal 2nd follow-up
 * never inherits a drained shared bucket. ~1 msg / 5s average ceiling.
 */
export const chatStreamHttpLimit = createRateLimiter(180, FIFTEEN_MIN, 'chat_stream');

/** Chat send burst — allows rapid follow-ups without a 15-minute lockout. */
export const chatStreamBurstLimit = createRateLimiter(45, ONE_MIN, 'chat_stream_burst');

/**
 * Composer preview — debounced 280ms client-side, so sustained typing fires
 * up to ~3/s in bursts. 240/15m drained in ~2 min of active journaling and
 * the 429s cascaded into chat sends; per-user keyed (auth runs first) so a
 * higher cap is safe.
 */
export const lexicalPreviewLimit = createRateLimiter(900, FIFTEEN_MIN, 'lexical_preview');

/** Composer LoreBook parse — same cadence as lexical preview. */
export const loreBookParseLimit = createRateLimiter(900, FIFTEEN_MIN, 'lorebook_parse');

/** Full lexical analyze / pipeline */
export const lexicalAnalyzeLimit = createRateLimiter(60, FIFTEEN_MIN, 'lexical_analyze');

/** Dev-only intelligence debug */
export const lexicalDebugLimit = createRateLimiter(30, FIFTEEN_MIN, 'lexical_debug');

/** Generic expensive compute (verification, rescan, etc.) */
export const computeHeavyLimit = createRateLimiter(40, FIFTEEN_MIN, 'compute_heavy');

/** External verification / third-party lookups */
export const externalApiLimit = createRateLimiter(25, FIFTEEN_MIN, 'external_api');

/**
 * Public, unauthenticated MCP OAuth endpoints (authorize / token / register /
 * consent) mount at the app root — outside the global `/api` tiered limiter —
 * so they need their own cap. Token + dynamic client registration are prime
 * abuse targets, so keep this tight: 60 requests / 15 min per IP.
 */
export const mcpOAuthLimit = createRateLimiter(60, FIFTEEN_MIN, 'mcp_oauth');

/**
 * Rate-limit chain for routes that call OpenAI directly (non-chat).
 * Add `requireAuth` and `checkAiRequestLimit` after this when auth is required.
 */
export function openAiRouteRateLimits(): RequestHandler[] {
  return [openAiHttpLimit, openAiHttpBurstLimit];
}

/** Rate-limit chain for user-facing chat sends only. */
export function chatStreamRateLimits(): RequestHandler[] {
  return [chatStreamHttpLimit, chatStreamBurstLimit];
}

/** @deprecated Use openAiRouteRateLimits + requireAuth + checkAiRequestLimit */
export function guardOpenAiRoute(): RequestHandler[] {
  return openAiRouteRateLimits();
}

/**
 * Dev tooling routes: open in local dev, privileged accounts only elsewhere.
 */
export const requireDevToolingAccess: RequestHandler = (req, res, next) => {
  if (config.apiEnv === 'dev') return next();
  return requireDevAccess(req, res, next);
};

import type { RequestHandler } from 'express';

import { config } from '../config';
import { requireDevAccess } from './rbac';
import { createRateLimiter } from './rateLimit';

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_MIN = 60 * 1000;

/** User-facing chat + direct OpenAI HTTP routes — 30 / 15 min */
export const openAiHttpLimit = createRateLimiter(30, FIFTEEN_MIN);

/** Burst guard for OpenAI HTTP routes — 8 / minute per user or IP */
export const openAiHttpBurstLimit = createRateLimiter(8, ONE_MIN);

/** Composer preview — debounced client-side but still CPU-heavy at scale */
export const lexicalPreviewLimit = createRateLimiter(240, FIFTEEN_MIN);

/** Composer LoreBook parse — same cadence as lexical preview. */
export const loreBookParseLimit = createRateLimiter(240, FIFTEEN_MIN);

/** Full lexical analyze / pipeline */
export const lexicalAnalyzeLimit = createRateLimiter(60, FIFTEEN_MIN);

/** Dev-only intelligence debug */
export const lexicalDebugLimit = createRateLimiter(30, FIFTEEN_MIN);

/** Generic expensive compute (verification, rescan, etc.) */
export const computeHeavyLimit = createRateLimiter(40, FIFTEEN_MIN);

/** External verification / third-party lookups */
export const externalApiLimit = createRateLimiter(25, FIFTEEN_MIN);

/**
 * Rate-limit chain for routes that call OpenAI directly.
 * Add `requireAuth` and `checkAiRequestLimit` after this when auth is required.
 */
export function openAiRouteRateLimits(): RequestHandler[] {
  return [openAiHttpLimit, openAiHttpBurstLimit];
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

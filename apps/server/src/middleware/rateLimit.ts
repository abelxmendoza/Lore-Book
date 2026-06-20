import type { Request, Response, NextFunction } from 'express';

import {
  checkRateLimit,
  createRateLimitStore,
  startRateLimitStoreJanitor,
} from '../lib/rateLimitCore';
import { logSecurityEvent } from '../services/securityLog';

// Shared janitor for all limiter stores in this module
startRateLimitStoreJanitor();

// SECURITY: Properly detect production environment
const isDevelopment = () =>
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test' ||
  (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_ANONYMOUS_MAX = 100;
const AUTHENTICATED_READ_MAX = 1200;
const AUTHENTICATED_WRITE_MAX = 300;

const globalStore = createRateLimitStore();

const getMaxRequests = (req: Request) => {
  if (isDevelopment()) return 10000;

  const isAuthenticated = Boolean((req as Request & { user?: { id?: string } }).user?.id);
  if (!isAuthenticated) return DEFAULT_ANONYMOUS_MAX;

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return AUTHENTICATED_READ_MAX;
  }

  return AUTHENTICATED_WRITE_MAX;
};

const getClientId = (req: Request): string => {
  return (req as Request & { user?: { id?: string } }).user?.id || req.ip || 'anonymous';
};

const getMethodBucket = (req: Request): 'read' | 'write' => {
  const method = req.method.toUpperCase();
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write';
};

function sendRateLimitResponse(
  req: Request,
  res: Response,
  retryAfterSec: number
): void {
  logSecurityEvent('rate_limit_exceeded', {
    ip: req.ip,
    path: req.path,
    clientId: getClientId(req).substring(0, 8),
    userAgent: req.headers['user-agent'] || 'unknown',
  });

  res.setHeader('Retry-After', String(retryAfterSec));
  res.status(429).json({
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: retryAfterSec,
  });
}

// Factory for endpoint-specific rate limiters (each gets its own store)
export function createRateLimiter(prodMax: number, windowMs = RATE_LIMIT_WINDOW_MS) {
  const limitStore = createRateLimitStore();
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const max = isDevelopment() ? 10000 : prodMax;
    const result = checkRateLimit(limitStore, clientId, max, windowMs);
    if (!result.allowed) {
      sendRateLimitResponse(req, res, result.retryAfterSec);
      return;
    }
    next();
  };
}

/**
 * Legacy global limiter — prefer tieredRateLimit for new code.
 * Kept for routes that opt into an extra per-endpoint cap on top of tiered limits.
 */
export const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientId = `${getClientId(req)}:${getMethodBucket(req)}`;
  const max = getMaxRequests(req);
  const result = checkRateLimit(globalStore, clientId, max, RATE_LIMIT_WINDOW_MS);
  if (!result.allowed) {
    sendRateLimitResponse(req, res, result.retryAfterSec);
    return;
  }
  next();
};

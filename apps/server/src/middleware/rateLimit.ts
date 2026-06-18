import type { Request, Response, NextFunction } from 'express';

import { logSecurityEvent } from '../services/securityLog';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// SECURITY: Properly detect production environment
const isDevelopment = () => process.env.NODE_ENV === 'development' ||
                      process.env.NODE_ENV === 'test' ||
                      (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

// More lenient rate limits in development
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_ANONYMOUS_MAX = 100;
const AUTHENTICATED_READ_MAX = 1200;
const AUTHENTICATED_WRITE_MAX = 300;

const getMaxRequests = (req: Request) => {
  if (isDevelopment()) return 10000;

  const isAuthenticated = Boolean((req as any).user?.id);
  if (!isAuthenticated) return DEFAULT_ANONYMOUS_MAX;

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return AUTHENTICATED_READ_MAX;
  }

  return AUTHENTICATED_WRITE_MAX;
};

// Factory for endpoint-specific rate limiters
export function createRateLimiter(prodMax: number, windowMs = RATE_LIMIT_WINDOW_MS) {
  const limitStore: RateLimitStore = {};
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const max = isDevelopment() ? 10000 : prodMax;
    const now = Date.now();
    const record = limitStore[clientId];
    if (!record || now > record.resetTime) {
      limitStore[clientId] = { count: 1, resetTime: now + windowMs };
      return next();
    }
    if (record.count >= max) {
      logSecurityEvent('rate_limit_exceeded', {
        ip: req.ip, path: req.path,
        clientId: clientId.substring(0, 8),
        userAgent: req.headers['user-agent'] || 'unknown',
      });
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }
    record.count++;
    next();
  };
}

const getClientId = (req: Request): string => {
  return (req as any).user?.id || req.ip || 'anonymous';
};

const getMethodBucket = (req: Request): 'read' | 'write' => {
  const method = req.method.toUpperCase();
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write';
};

export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const clientId = `${getClientId(req)}:${getMethodBucket(req)}`;
  const max = getMaxRequests(req);
  const now = Date.now();
  const record = store[clientId];

  if (!record || now > record.resetTime) {
    // New window
    store[clientId] = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    return next();
  }

  if (record.count >= max) {
    logSecurityEvent('rate_limit_exceeded', {
      ip: req.ip,
      path: req.path,
      clientId: clientId.substring(0, 8),
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    });
  }

  record.count++;
  next();
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of Object.entries(store)) {
    if (now > record.resetTime) {
      delete store[key];
    }
  }
}, 60 * 1000); // Every minute

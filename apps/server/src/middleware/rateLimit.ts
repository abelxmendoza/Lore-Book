import type { Request, Response, NextFunction } from 'express';
import { logSecurityEvent } from '../services/securityLog';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 100;

const getClientId = (req: Request): string => {
  return (req as any).user?.id || req.ip || 'anonymous';
};

export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const clientId = getClientId(req);
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

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    logSecurityEvent('rate_limit_exceeded', {
      ip: req.ip,
      path: req.path,
      clientId: clientId.substring(0, 8),
      userAgent: req.headers['user-agent'],
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

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of Object.entries(store)) {
    if (now > record.resetTime) {
      delete store[key];
    }
  }
}, 60 * 1000); // Every minute

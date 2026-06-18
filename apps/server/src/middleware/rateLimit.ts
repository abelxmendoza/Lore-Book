import type { Request, Response, NextFunction } from 'express';

import { getRedisClient, isRedisConfigured } from '../lib/redis';
import { logger } from '../logger';
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
  const applyInMemoryLimit = (req: Request, res: Response, next: NextFunction) => {
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

  return (req: Request, res: Response, next: NextFunction) => {
    if (!isRedisConfigured()) {
      return applyInMemoryLimit(req, res, next);
    }

    void applyEndpointRedisLimit(req, res, prodMax, windowMs, next)
      .then((handled) => {
        if (!handled) applyInMemoryLimit(req, res, next);
      })
      .catch((error) => {
        logger.warn({ error }, 'Redis endpoint rate limit failed; falling back to in-memory state');
        applyInMemoryLimit(req, res, next);
      });
  };
}

const getClientId = (req: Request): string => {
  return (req as any).user?.id || req.ip || 'anonymous';
};

const getMethodBucket = (req: Request): 'read' | 'write' => {
  const method = req.method.toUpperCase();
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write';
};

const applyRedisRateLimit = async (
  req: Request,
  res: Response,
  key: string,
  max: number,
  windowMs: number
): Promise<boolean | null> => {
  const redis = await getRedisClient();
  if (!redis) return null;

  const redisKey = `lk:rate:${key}`;
  const windowSeconds = Math.ceil(windowMs / 1000);
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  if (count <= max) {
    return false;
  }

  const ttl = await redis.ttl(redisKey);
  const retryAfter = ttl > 0 ? ttl : windowSeconds;
  logSecurityEvent('rate_limit_exceeded', {
    ip: req.ip,
    path: req.path,
    clientId: key.substring(0, 8),
    userAgent: req.headers['user-agent'] || 'unknown',
    backend: 'redis',
  });
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter,
  });
  return true;
};

export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!isRedisConfigured()) {
    return rateLimitMiddlewareInMemory(req, res, next);
  }

  void rateLimitMiddlewareAsync(req, res, next).catch((error) => {
    logger.warn({ error }, 'Redis rate limit failed; falling back to in-memory state');
    rateLimitMiddlewareInMemory(req, res, next);
  });
};

const rateLimitMiddlewareInMemory = (
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

const rateLimitMiddlewareAsync = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const clientId = `${getClientId(req)}:${getMethodBucket(req)}`;
  const max = getMaxRequests(req);
  const redisLimited = await applyRedisRateLimit(req, res, clientId, max, RATE_LIMIT_WINDOW_MS);
  if (redisLimited !== null) {
    if (redisLimited) return;
    return next();
  }
  return rateLimitMiddlewareInMemory(req, res, next);
};

const applyEndpointRedisLimit = async (
  req: Request,
  res: Response,
  prodMax: number,
  windowMs: number,
  next: NextFunction
) => {
  const clientId = getClientId(req);
  const max = isDevelopment() ? 10000 : prodMax;
  const redisLimited = await applyRedisRateLimit(
    req,
    res,
    `custom:${clientId}:${req.path}`,
    max,
    windowMs
  );
  if (redisLimited === null) return false;
  if (redisLimited) return true;
  next();
  return true;
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

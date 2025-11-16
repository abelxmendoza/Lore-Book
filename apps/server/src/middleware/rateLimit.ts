import type { NextFunction, Request, Response } from 'express';

import { logSecurityEvent } from '../services/securityLog';

const WINDOW_MS = 60_000;
const SOFT_LIMIT = 50;
const HARD_LIMIT = 200;

type Tracker = {
  count: number;
  firstRequest: number;
};

const requestCounts = new Map<string, Tracker>();

export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  const now = Date.now();
  const tracker = requestCounts.get(ip) ?? { count: 0, firstRequest: now };

  if (now - tracker.firstRequest > WINDOW_MS) {
    tracker.count = 0;
    tracker.firstRequest = now;
  }

  tracker.count += 1;
  requestCounts.set(ip, tracker);

  if (tracker.count > HARD_LIMIT) {
    logSecurityEvent('hard_rate_limit', { ip, path: req.path, count: tracker.count });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  if (tracker.count > SOFT_LIMIT) {
    logSecurityEvent('soft_rate_limit', { ip, path: req.path, count: tracker.count });
    res.setHeader('Retry-After', '15');
    return res.status(429).json({ error: 'You are making requests too quickly. Please retry shortly.' });
  }

  next();
};

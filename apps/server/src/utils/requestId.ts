import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Middleware to add a unique request ID to each request
 * Useful for tracing requests across services
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.headers['x-request-id'] as string || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};


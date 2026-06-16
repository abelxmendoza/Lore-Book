import type { NextFunction, Response } from 'express';

import type { AuthenticatedRequest } from './auth';

/**
 * Rejects requests where a URL param userId does not match the authenticated user.
 * Use on self-scoped diagnostic endpoints that retain :userId for backward compatibility.
 */
export function requireSelfUserIdParam(paramName = 'userId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const raw = req.params[paramName];
    const paramUserId = Array.isArray(raw) ? raw[0] : raw;

    if (paramUserId && paramUserId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}

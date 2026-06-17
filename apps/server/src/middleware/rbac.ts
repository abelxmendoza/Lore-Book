import type { Response, NextFunction } from 'express';

import { config } from '../config';
import {
  type PlatformRole,
  resolveAccountAuthority,
  resolveAccountAuthorityFromAuthUser,
  PRIVILEGED_PLATFORM_ROLES,
} from '../lib/accountAuthority';
import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

import type { AuthenticatedRequest } from './auth';

/** @deprecated Use PlatformRole from accountAuthority — kept for backward compatibility. */
export type UserRole = PlatformRole;

async function getUserRole(userId: string): Promise<PlatformRole> {
  const authority = await resolveAccountAuthority(userId);
  return authority.role;
}

/**
 * Check if user has required role
 */
export function requireRole(...allowedRoles: PlatformRole[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRole = await getUserRole(req.user.id);

    if (!allowedRoles.includes(userRole)) {
      logger.warn({
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles,
        path: req.path,
      }, 'Access denied: insufficient role');
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }

    (req as AuthenticatedRequest & { userRole?: PlatformRole }).userRole = userRole;
    next();
  };
}

/**
 * Owner, admin, and developer access. Always enforced in production.
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (config.apiEnv === 'dev' || config.apiEnv === 'development') {
    return next();
  }
  return requireRole('owner', 'admin', 'developer')(req, res, next);
};

/**
 * Check if dev console access is allowed
 */
export function requireDevAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (config.apiEnv === 'dev') {
    return next();
  }

  getUserRole(req.user.id).then(role => {
    if (PRIVILEGED_PLATFORM_ROLES.includes(role)) {
      return next();
    }
    return res.status(403).json({ error: 'Dev console access denied' });
  }).catch(() => {
    return res.status(500).json({ error: 'Failed to verify access' });
  });
}

/**
 * Check if experimental features are enabled
 */
export function requireExperimental(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (config.enableExperimental) {
    return next();
  }

  if (req.user?.id) {
    getUserRole(req.user.id).then(role => {
      if (PRIVILEGED_PLATFORM_ROLES.includes(role)) {
        return next();
      }
      return res.status(403).json({ error: 'Experimental features disabled' });
    }).catch(() => {
      return res.status(500).json({ error: 'Failed to verify access' });
    });
  } else {
    return res.status(403).json({ error: 'Experimental features disabled' });
  }
}

export { getUserRole, resolveAccountAuthority, resolveAccountAuthorityFromAuthUser };

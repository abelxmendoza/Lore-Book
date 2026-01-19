import type { Response, NextFunction } from 'express';

import { config } from '../config';
import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

import type { AuthenticatedRequest } from './auth';

export type UserRole = 'admin' | 'developer' | 'standard_user' | 'beta_user';

/**
 * Get user role from database
 */
async function getUserRole(userId: string): Promise<UserRole> {
  try {
    // Check if user is admin by ID match
    if (config.adminUserId && userId === config.adminUserId) {
      return 'admin';
    }

    // Check user metadata/role from auth.users table
    const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (error || !userData?.user) {
      logger.debug({ error, userId }, 'Failed to get user role, defaulting to standard_user');
      return 'standard_user';
    }

    // Check by email (Abel Mendoza - abelxmendoza@gmail.com)
    const adminEmail = process.env.ADMIN_EMAIL || 'abelxmendoza@gmail.com';
    if (userData.user.email === adminEmail) {
      return 'admin';
    }

    const role = (userData.user.user_metadata?.role as UserRole) || 
                 (userData.user.app_metadata?.role as UserRole) ||
                 'standard_user';

    return role;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting user role');
    return 'standard_user';
  }
}

/**
 * Check if user has required role
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRole = await getUserRole(req.user.id);
    
    // In dev mode, allow admin access
    if (config.apiEnv === 'dev' && config.adminUserId === req.user.id) {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      logger.warn({ 
        userId: req.user.id, 
        userRole, 
        requiredRoles: allowedRoles,
        path: req.path 
      }, 'Access denied: insufficient role');
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Insufficient permissions' 
      });
    }

    // Attach role to request for use in handlers
    (req as any).userRole = userRole;
    next();
  };
}

/**
 * Check if user is admin
 * In development mode, allow access for testing
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Allow access in development mode for testing
  if (config.apiEnv === 'dev' || config.apiEnv === 'development') {
    return next();
  }
  
  // In production, require admin role
  return requireRole('admin', 'developer')(req, res, next);
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

  // Allow in dev environment
  if (config.apiEnv === 'dev') {
    return next();
  }

  // Allow if user is admin/developer
  getUserRole(req.user.id).then(role => {
    if (role === 'admin' || role === 'developer') {
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

  // Check if user is admin (admins can access experimental features)
  if (req.user?.id) {
    getUserRole(req.user.id).then(role => {
      if (role === 'admin' || role === 'developer') {
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


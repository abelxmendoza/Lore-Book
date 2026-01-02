/**
 * Role Guard Middleware Helpers
 */

import { config } from '../config';
import { logger } from '../logger';

export interface User {
  id: string;
  role?: string;
  user_metadata?: {
    role?: string;
  };
  app_metadata?: {
    role?: string;
  };
}

export interface Env {
  API_ENV?: string;
  ADMIN_USER_ID?: string;
}

/**
 * Require admin role
 */
export function requireAdmin(user?: User | null): void {
  if (!user) {
    throw new Error('Unauthorized: User not authenticated');
  }

  const userRole = user.role || 
                   user.user_metadata?.role || 
                   user.app_metadata?.role;

  if (userRole !== 'admin' && userRole !== 'developer') {
    logger.warn({ userId: user.id, userRole }, 'Access denied: Admin role required');
    throw new Error('Unauthorized: Admin role required');
  }
}

/**
 * Require dev access
 */
export function requireDev(user?: User | null, env?: Env): void {
  const envConfig = env || {
    API_ENV: config.apiEnv,
    ADMIN_USER_ID: config.adminUserId
  };

  // Allow in dev environment
  if (envConfig.API_ENV === 'dev') {
    return;
  }

  // Allow if user is admin/developer
  if (user) {
    const userRole = user.role || 
                     user.user_metadata?.role || 
                     user.app_metadata?.role;
    
    if (userRole === 'admin' || userRole === 'developer') {
      return;
    }

    // Allow if user ID matches admin user ID
    if (envConfig.ADMIN_USER_ID && user.id === envConfig.ADMIN_USER_ID) {
      return;
    }
  }

  logger.warn({ userId: user?.id, apiEnv: envConfig.API_ENV }, 'Access denied: Dev access required');
  throw new Error('Unauthorized: Dev access required');
}


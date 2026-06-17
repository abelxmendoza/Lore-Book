/**
 * @deprecated Use accountAuthority + rbac middleware for HTTP enforcement.
 * Sync helpers for legacy callers — delegates to canonical server authority.
 */

import { config } from '../config';
import { logger } from '../logger';
import {
  resolveAccountAuthorityFromAuthUser,
  canAccessAdminConsole,
  canAccessDevConsole,
  type AuthUserLike,
} from '../lib/accountAuthority';

export interface User extends AuthUserLike {
  role?: string;
}

export interface Env {
  API_ENV?: string;
  ADMIN_USER_ID?: string;
}

/**
 * Require admin role (owner, admin, or developer).
 */
export function requireAdmin(user?: User | null): void {
  if (!user) {
    throw new Error('Unauthorized: User not authenticated');
  }

  const authority = resolveAccountAuthorityFromAuthUser(user);
  if (!canAccessAdminConsole(authority.role)) {
    logger.warn({ userId: user.id, role: authority.role }, 'Access denied: Admin role required');
    throw new Error('Unauthorized: Admin role required');
  }
}

/**
 * Require dev console access.
 */
export function requireDev(user?: User | null, env?: Env): void {
  const envConfig = env || {
    API_ENV: config.apiEnv,
    ADMIN_USER_ID: config.adminUserId,
  };

  if (envConfig.API_ENV === 'dev') {
    return;
  }

  if (user) {
    const authority = resolveAccountAuthorityFromAuthUser(user);
    if (canAccessDevConsole(authority.role)) {
      return;
    }

    if (envConfig.ADMIN_USER_ID && user.id === envConfig.ADMIN_USER_ID) {
      return;
    }
  }

  logger.warn({ userId: user?.id, apiEnv: envConfig.API_ENV }, 'Access denied: Dev access required');
  throw new Error('Unauthorized: Dev access required');
}

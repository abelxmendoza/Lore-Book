/**
 * Role Guard Middleware
 * Protects routes based on user roles
 */

import { config } from '../config/env';

const apiEnv = import.meta.env.VITE_API_ENV || import.meta.env.MODE || 'dev';
const adminUserId = import.meta.env.VITE_ADMIN_USER_ID;
const isProduction = config.env.isProduction;

/**
 * Check if user has admin role
 */
export const isAdmin = (user: any): boolean => {
  if (!user) return false;
  
  return !!(
    user.user_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'developer' ||
    user.app_metadata?.role === 'admin' ||
    user.app_metadata?.role === 'developer' ||
    (adminUserId && user.id === adminUserId)
  );
};

/**
 * Check if user can access admin console
 * In production: STRICTLY requires admin role (no exceptions)
 * In development: Allows access for testing
 */
export const canAccessAdmin = (user: any): boolean => {
  // In production, STRICTLY require admin role - no exceptions
  if (isProduction) {
    // Must be authenticated AND have admin role
    if (!user) return false;
    return isAdmin(user);
  }
  
  // In development, allow access for testing
  if (apiEnv === 'dev' || apiEnv === 'development') {
    return true;
  }
  
  // Default: require admin role
  return isAdmin(user);
};

/**
 * Check if user can access dev console
 * In production: COMPLETELY DISABLED (even for admins)
 * In development: Visible when API_ENV === "dev" OR user is admin
 */
export const canAccessDevConsole = (user: any): boolean => {
  // In production, dev console is COMPLETELY DISABLED
  if (isProduction) {
    return false;
  }
  
  // In development, allow if API_ENV is dev or user is admin
  if (apiEnv === 'dev' || apiEnv === 'development') {
    return true;
  }
  
  if (adminUserId && user?.id === adminUserId) {
    return true;
  }
  
  if (isAdmin(user)) {
    return true;
  }
  
  return false;
};

/**
 * Redirect unauthorized users
 */
export const redirectUnauthorized = (path: string = '/') => {
  window.location.href = path;
};


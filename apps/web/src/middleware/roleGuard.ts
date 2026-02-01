/**
 * Role Guard Middleware
 * Protects routes based on user roles
 */

import { config } from '../config/env';

const apiEnv = import.meta.env.VITE_API_ENV || import.meta.env.MODE || 'dev';
const adminUserId = import.meta.env.VITE_ADMIN_USER_ID;
const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || 'abelxmendoza@gmail.com').trim().toLowerCase();
const isProduction = config.env.isProduction;

/** Only this email is allowed admin; no role metadata or other users. */
const ALLOWED_ADMIN_EMAIL = adminEmail;

/**
 * Check if user is the allowed admin (abelxmendoza@gmail.com only).
 * No other user or role metadata grants admin.
 */
export const isAdmin = (user: any): boolean => {
  if (!user?.email) return false;
  if (String(user.email).trim().toLowerCase() === ALLOWED_ADMIN_EMAIL) return true;
  if (adminUserId && user.id === adminUserId) return true;
  return false;
};

/**
 * Check if user can access admin console.
 * Only the allowed admin email (abelxmendoza@gmail.com) can access—in all environments.
 */
export const canAccessAdmin = (user: any): boolean => {
  if (!user) return false;
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


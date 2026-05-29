/**
 * Role Guard Middleware
 * Protects routes based on user roles.
 *
 * Admin identity comes from server-controlled app_metadata.role ('admin' or
 * 'developer') set via the Supabase service-role key. The email fallback is
 * kept only as a secondary check and reads from an env var — the literal
 * address is never baked into the frontend bundle.
 */

import { config } from '../config/env';

const apiEnv = import.meta.env.VITE_API_ENV || import.meta.env.MODE || 'dev';
const adminUserId = import.meta.env.VITE_ADMIN_USER_ID as string | undefined;
// Never fall back to a hardcoded email in the bundle — require the env var.
const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase();
const isProduction = config.env.isProduction;

/**
 * Check if a Supabase auth user object belongs to the admin.
 *
 * Priority order:
 *   1. app_metadata.role === 'admin' | 'developer'  (server-set, most authoritative)
 *   2. user_metadata.role === 'admin' | 'developer' (also server-set via service role)
 *   3. VITE_ADMIN_USER_ID match (explicit UUID override)
 *   4. VITE_ADMIN_EMAIL match (env-only, never a hardcoded string)
 */
export const isAdmin = (user: any): boolean => {
  if (!user) return false;

  // Prefer role claims — these are set server-side and never forgeable by the user.
  const appRole: string | undefined = user.app_metadata?.role;
  const userRole: string | undefined = user.user_metadata?.role;
  if (appRole === 'admin' || appRole === 'developer') return true;
  if (userRole === 'admin' || userRole === 'developer') return true;

  // UUID-based override (useful in dev without metadata)
  if (adminUserId && user.id === adminUserId) return true;

  // Email-based check — only if the env var is explicitly set
  if (adminEmail && user.email?.trim().toLowerCase() === adminEmail) return true;

  return false;
};

/**
 * Check if user can access admin console.
 */
export const canAccessAdmin = (user: any): boolean => {
  if (!user) return false;
  return isAdmin(user);
};

/**
 * Check if user can access dev console.
 * Completely disabled in production even for admins.
 */
export const canAccessDevConsole = (user: any): boolean => {
  if (isProduction) return false;
  if (apiEnv === 'dev' || apiEnv === 'development') return true;
  if (adminUserId && user?.id === adminUserId) return true;
  if (isAdmin(user)) return true;
  return false;
};

export const redirectUnauthorized = (path: string = '/') => {
  window.location.href = path;
};

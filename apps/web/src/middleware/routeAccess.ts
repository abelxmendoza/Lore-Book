/**
 * Route access levels for the web app router.
 *
 * SECURITY: Role checks use server authority from GET /api/user/authority.
 * ProtectedRoute enforces these at the router boundary; API routes enforce separately.
 */

export type RouteAccessLevel = 'public' | 'authenticated' | 'admin' | 'dev-console';

/** Paths that never require authentication. */
export const PUBLIC_ROUTE_PREFIXES = [
  '/',
  '/features',
  '/investors',
  '/about',
  '/lore',
  '/login',
  '/auth/callback',
  '/terms',
  '/privacy-policy',
  '/demo',
  '/upgrade',
  '/404',
] as const;

/** Paths that require platform admin (owner / admin / developer). */
export const ADMIN_ROUTE_PREFIXES = ['/admin', '/ontology', '/intelligence', '/diagnostics'] as const;

/** Dev/operator surfaces — disabled entirely in production builds. */
export const DEV_CONSOLE_ROUTE = '/dev-console';
export const DEV_OPERATOR_ROUTE_PREFIXES = [DEV_CONSOLE_ROUTE] as const;

export function isPublicRoutePath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

export function isAdminRoutePath(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isDevConsoleRoutePath(pathname: string): boolean {
  return DEV_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** App shell (/home, /chat, …) requires auth, guest entry, or demo — not a cold anonymous visit. */
export function isAppShellRoutePath(pathname: string): boolean {
  return !isPublicRoutePath(pathname) && !isDevConsoleRoutePath(pathname);
}

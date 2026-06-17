/**
 * Client-side role display helpers.
 *
 * SECURITY: The server determines roles via GET /api/user/authority.
 * These helpers operate on server-serialized authority only — they never grant access.
 */

import type { ServerAccountAuthority } from '../lib/accountAuthority';
import {
  canAccessAdminFromAuthority,
  canAccessDevConsoleFromAuthority,
  isOwnerRole,
  isDeveloperRole,
  isAdminRole,
} from '../lib/accountAuthority';

/** @deprecated Use useAccountAuthority() — client JWT metadata is not authoritative. */
export function redirectUnauthorized(path: string = '/'): void {
  window.location.href = path;
}

export function canAccessAdmin(authority: ServerAccountAuthority | null | undefined): boolean {
  return canAccessAdminFromAuthority(authority ?? null);
}

export function canAccessDevConsole(authority: ServerAccountAuthority | null | undefined): boolean {
  return canAccessDevConsoleFromAuthority(authority ?? null);
}

export function isFounderFromAuthority(authority: ServerAccountAuthority | null | undefined): boolean {
  return authority?.isFounderAccount === true || isOwnerRole(authority?.role);
}

export function displayRoleLabel(authority: ServerAccountAuthority | null | undefined): string | null {
  if (!authority) return null;
  if (isOwnerRole(authority.role)) return 'Owner';
  if (isAdminRole(authority.role)) return 'Admin';
  if (isDeveloperRole(authority.role)) return 'Developer';
  return null;
}

export function displayFounderSubline(authority: ServerAccountAuthority | null | undefined): string | null {
  if (!authority?.isFounderAccount) return null;
  return 'Founder Account · Premium Access Included';
}

export function displayDeveloperSubline(authority: ServerAccountAuthority | null | undefined): string | null {
  if (!isDeveloperRole(authority?.role)) return null;
  return 'Developer Account · Premium Access Included';
}

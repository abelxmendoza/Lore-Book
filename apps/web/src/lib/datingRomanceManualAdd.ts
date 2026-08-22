import type { ServerAccountAuthority } from './accountAuthority';

/**
 * Manual Dating & Romance character adds stay on the owner/admin account.
 * Demo mode and every other role must never see or trigger this write.
 */
export function canManuallyAddDatingRomanceCharacters(
  authority: ServerAccountAuthority | null | undefined,
  options: { demoMode: boolean },
): boolean {
  if (options.demoMode) return false;
  if (!authority) return false;
  return authority.isFounderAccount === true || authority.role === 'owner' || authority.role === 'admin';
}

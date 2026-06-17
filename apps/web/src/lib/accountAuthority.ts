/** Public roles returned by GET /api/user/authority — server is source of truth. */
export type PublicPlatformRole = 'owner' | 'admin' | 'developer' | 'user' | 'beta_user';

export type PrivilegeSource =
  | 'platform_authority'
  | 'administrative_privilege'
  | 'development_privilege'
  | 'stripe_subscription'
  | 'free_tier';

/** Server-serialized authority — never computed on the client. */
export interface ServerAccountAuthority {
  role: PublicPlatformRole;
  roleLabel: string;
  isFounderAccount: boolean;
  isPrivileged: boolean;
  privilegeSource: PrivilegeSource | null;
  effectivePlanType: 'premium' | 'free';
  canBeBilled: boolean;
  canCancelSubscription: boolean;
  canLoseAccess: boolean;
  canAccessAdmin: boolean;
  canAccessDevConsole: boolean;
}

/** Subscription status may include a compatible authority block. */
export interface AccountAuthority {
  role: PublicPlatformRole;
  roleLabel?: string;
  isFounderAccount?: boolean;
  isPrivileged: boolean;
  privilegeSource?: PrivilegeSource | null;
}

export function privilegeSourceLabel(source?: PrivilegeSource | null): string {
  switch (source) {
    case 'platform_authority': return 'Platform authority';
    case 'administrative_privilege': return 'Administrative privilege';
    case 'development_privilege': return 'Development privilege';
    case 'stripe_subscription': return 'Stripe subscription';
    case 'free_tier': return 'Free tier';
    default: return 'Unknown';
  }
}

export function isPrivilegedAuthority(authority?: AccountAuthority | ServerAccountAuthority | null): boolean {
  return authority?.isPrivileged === true;
}

export function canAccessAdminFromAuthority(authority?: ServerAccountAuthority | null): boolean {
  return authority?.canAccessAdmin === true;
}

export function canAccessDevConsoleFromAuthority(authority?: ServerAccountAuthority | null): boolean {
  return authority?.canAccessDevConsole === true;
}

export function isOwnerRole(role?: PublicPlatformRole | null): boolean {
  return role === 'owner';
}

export function isDeveloperRole(role?: PublicPlatformRole | null): boolean {
  return role === 'developer';
}

export function isAdminRole(role?: PublicPlatformRole | null): boolean {
  return role === 'admin';
}

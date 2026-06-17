import { config } from '../config';
import { supabaseAdmin } from '../services/supabaseClient';

/** Internal platform roles — highest authority first. */
export type PlatformRole = 'owner' | 'admin' | 'developer' | 'standard_user' | 'beta_user';

/** Public API role names exposed to clients. */
export type PublicPlatformRole = 'owner' | 'admin' | 'developer' | 'user' | 'beta_user';

export type PrivilegeSource =
  | 'platform_authority'
  | 'administrative_privilege'
  | 'development_privilege'
  | 'stripe_subscription'
  | 'free_tier';

export interface AccountAuthority {
  role: PlatformRole;
  roleLabel: string;
  isFounderAccount: boolean;
  isPrivileged: boolean;
  privilegeSource: PrivilegeSource | null;
  effectivePlanType: 'premium' | 'free';
  canBeBilled: boolean;
  canCancelSubscription: boolean;
  canLoseAccess: boolean;
}

/** JSON shape returned by GET /api/user/authority */
export interface PublicAccountAuthority {
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

export type AuthUserLike = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  /** Informational only — never used for authorization. */
  user_metadata?: Record<string, unknown>;
};

const PRIVILEGED_ROLES = new Set<PlatformRole>(['owner', 'admin', 'developer']);

function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

function roleLabel(role: PlatformRole): string {
  switch (role) {
    case 'owner': return 'Owner';
    case 'admin': return 'Admin';
    case 'developer': return 'Developer';
    case 'beta_user': return 'Beta User';
    default: return 'User';
  }
}

function privilegeSourceForRole(role: PlatformRole): PrivilegeSource | null {
  switch (role) {
    case 'owner': return 'platform_authority';
    case 'admin': return 'administrative_privilege';
    case 'developer': return 'development_privilege';
    default: return null;
  }
}

function buildAuthority(role: PlatformRole, isFounderAccount: boolean): AccountAuthority {
  const isPrivileged = PRIVILEGED_ROLES.has(role);
  return {
    role,
    roleLabel: roleLabel(role),
    isFounderAccount,
    isPrivileged,
    privilegeSource: isPrivileged ? privilegeSourceForRole(role) : null,
    effectivePlanType: isPrivileged ? 'premium' : 'free',
    canBeBilled: !isPrivileged,
    canCancelSubscription: !isPrivileged,
    canLoseAccess: !isPrivileged,
  };
}

/**
 * Server-set role from app_metadata only.
 * user_metadata is informational and must never grant privilege.
 */
function authoritativeAppRole(user: AuthUserLike): string {
  return String(user.app_metadata?.role ?? '').toLowerCase();
}

export function toPublicRole(role: PlatformRole): PublicPlatformRole {
  return role === 'standard_user' ? 'user' : role;
}

export function canAccessAdminConsole(role: PlatformRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'developer';
}

export function canAccessDevConsole(role: PlatformRole): boolean {
  return canAccessAdminConsole(role);
}

export function serializeAccountAuthority(authority: AccountAuthority): PublicAccountAuthority {
  return {
    role: toPublicRole(authority.role),
    roleLabel: authority.roleLabel,
    isFounderAccount: authority.isFounderAccount,
    isPrivileged: authority.isPrivileged,
    privilegeSource: authority.privilegeSource,
    effectivePlanType: authority.effectivePlanType,
    canBeBilled: authority.canBeBilled,
    canCancelSubscription: authority.canCancelSubscription,
    canLoseAccess: authority.canLoseAccess,
    canAccessAdmin: canAccessAdminConsole(authority.role),
    canAccessDevConsole: canAccessDevConsole(authority.role),
  };
}

/**
 * Canonical server-side role resolution.
 * Precedence: env identity (owner/admin/developer email or id) → app_metadata.role → standard_user.
 */
export function resolveAccountAuthorityFromAuthUser(user: AuthUserLike): AccountAuthority {
  const email = normalizeEmail(user.email);
  const appRole = authoritativeAppRole(user);

  const isFounderById = !!config.ownerUserId && user.id === config.ownerUserId;
  const isFounderByEmail = !!config.ownerEmail && email === config.ownerEmail;

  if (isFounderById || isFounderByEmail || appRole === 'owner') {
    return buildAuthority('owner', true);
  }

  if ((config.adminUserId && user.id === config.adminUserId) ||
      (config.adminEmail && email === config.adminEmail) ||
      appRole === 'admin') {
    return buildAuthority('admin', false);
  }

  if ((config.developerEmail && email === config.developerEmail) || appRole === 'developer') {
    return buildAuthority('developer', false);
  }

  if (appRole === 'beta_user') {
    return buildAuthority('beta_user', false);
  }

  return buildAuthority('standard_user', false);
}

export async function resolveAccountAuthority(userId: string): Promise<AccountAuthority> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return buildAuthority('standard_user', false);
    }
    return resolveAccountAuthorityFromAuthUser(data.user);
  } catch {
    return buildAuthority('standard_user', false);
  }
}

export async function isPrivilegedAccount(userId: string): Promise<boolean> {
  const authority = await resolveAccountAuthority(userId);
  return authority.isPrivileged;
}

export async function isBillingExempt(userId: string): Promise<boolean> {
  const authority = await resolveAccountAuthority(userId);
  return !authority.canBeBilled;
}

export function isFounderAccount(userId: string, email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (config.ownerUserId && userId === config.ownerUserId) return true;
  if (config.ownerEmail && normalized === config.ownerEmail) return true;
  return false;
}

export function isFounderEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return !!config.ownerEmail && normalized === config.ownerEmail;
}

/** Privileged roles that supersede Stripe subscription checks. */
export const PRIVILEGED_PLATFORM_ROLES: readonly PlatformRole[] = ['owner', 'admin', 'developer'];

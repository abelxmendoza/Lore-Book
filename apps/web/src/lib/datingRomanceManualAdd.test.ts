import { describe, expect, it } from 'vitest';

import type { ServerAccountAuthority } from './accountAuthority';
import { canManuallyAddDatingRomanceCharacters } from './datingRomanceManualAdd';

const adminAuthority: ServerAccountAuthority = {
  role: 'admin',
  roleLabel: 'Admin',
  isFounderAccount: false,
  isPrivileged: true,
  privilegeSource: 'administrative_privilege',
  effectivePlanType: 'premium',
  canBeBilled: false,
  canCancelSubscription: false,
  canLoseAccess: false,
  canAccessAdmin: true,
  canAccessDevConsole: true,
};

const ownerAuthority: ServerAccountAuthority = {
  ...adminAuthority,
  role: 'owner',
  roleLabel: 'Owner',
  isFounderAccount: true,
  privilegeSource: 'platform_authority',
};

const userAuthority: ServerAccountAuthority = {
  ...adminAuthority,
  role: 'user',
  roleLabel: 'User',
  isFounderAccount: false,
  isPrivileged: false,
  privilegeSource: 'free_tier',
  effectivePlanType: 'free',
  canBeBilled: true,
  canCancelSubscription: true,
  canLoseAccess: true,
  canAccessAdmin: false,
  canAccessDevConsole: false,
};

const developerAuthority: ServerAccountAuthority = {
  ...adminAuthority,
  role: 'developer',
  roleLabel: 'Developer',
  isFounderAccount: false,
  privilegeSource: 'development_privilege',
};

describe('canManuallyAddDatingRomanceCharacters', () => {
  it('allows the owner/admin account when not in demo', () => {
    expect(canManuallyAddDatingRomanceCharacters(adminAuthority, { demoMode: false })).toBe(true);
    expect(canManuallyAddDatingRomanceCharacters(ownerAuthority, { demoMode: false })).toBe(true);
  });

  it('never allows demo mode, even for admin', () => {
    expect(canManuallyAddDatingRomanceCharacters(adminAuthority, { demoMode: true })).toBe(false);
    expect(canManuallyAddDatingRomanceCharacters(ownerAuthority, { demoMode: true })).toBe(false);
  });

  it('never allows other accounts', () => {
    expect(canManuallyAddDatingRomanceCharacters(userAuthority, { demoMode: false })).toBe(false);
    expect(canManuallyAddDatingRomanceCharacters(developerAuthority, { demoMode: false })).toBe(false);
    expect(canManuallyAddDatingRomanceCharacters(null, { demoMode: false })).toBe(false);
  });
});

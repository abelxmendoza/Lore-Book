import { describe, it, expect } from 'vitest';
import {
  canAccessAdmin,
  canAccessDevConsole,
  displayFounderSubline,
  displayDeveloperSubline,
  isFounderFromAuthority,
} from './roleGuard';
import type { ServerAccountAuthority } from '../lib/accountAuthority';

const ownerAuthority: ServerAccountAuthority = {
  role: 'owner',
  roleLabel: 'Owner',
  isFounderAccount: true,
  isPrivileged: true,
  privilegeSource: 'platform_authority',
  effectivePlanType: 'premium',
  canBeBilled: false,
  canCancelSubscription: false,
  canLoseAccess: false,
  canAccessAdmin: true,
  canAccessDevConsole: true,
};

const developerAuthority: ServerAccountAuthority = {
  role: 'developer',
  roleLabel: 'Developer',
  isFounderAccount: false,
  isPrivileged: true,
  privilegeSource: 'development_privilege',
  effectivePlanType: 'premium',
  canBeBilled: false,
  canCancelSubscription: false,
  canLoseAccess: false,
  canAccessAdmin: true,
  canAccessDevConsole: true,
};

const userAuthority: ServerAccountAuthority = {
  role: 'user',
  roleLabel: 'User',
  isFounderAccount: false,
  isPrivileged: false,
  privilegeSource: null,
  effectivePlanType: 'free',
  canBeBilled: true,
  canCancelSubscription: true,
  canLoseAccess: true,
  canAccessAdmin: false,
  canAccessDevConsole: false,
};

describe('roleGuard (server authority display helpers)', () => {
  it('canAccessAdmin is true for owner and developer', () => {
    expect(canAccessAdmin(ownerAuthority)).toBe(true);
    expect(canAccessAdmin(developerAuthority)).toBe(true);
    expect(canAccessAdmin(userAuthority)).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });

  it('canAccessDevConsole follows server authority flags', () => {
    expect(canAccessDevConsole(developerAuthority)).toBe(true);
    expect(canAccessDevConsole(userAuthority)).toBe(false);
  });

  it('shows founder subline for owner authority', () => {
    expect(displayFounderSubline(ownerAuthority)).toContain('Founder Account');
    expect(displayDeveloperSubline(ownerAuthority)).toBeNull();
  });

  it('shows developer subline for developer authority', () => {
    expect(displayDeveloperSubline(developerAuthority)).toContain('Developer Account');
  });

  it('isFounderFromAuthority uses server flag', () => {
    expect(isFounderFromAuthority(ownerAuthority)).toBe(true);
    expect(isFounderFromAuthority(developerAuthority)).toBe(false);
  });
});

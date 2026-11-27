import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: {
    hivemindAccess: 'founder',
    ownerEmail: 'owner@example.com',
  },
}));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));

import { resolveAccountAuthorityFromAuthUser, serializeAccountAuthority } from '../../src/lib/accountAuthority';
import { canUseHivemind } from '../../src/lib/hivemindAccess';

describe('canUseHivemind', () => {
  it('founder level (default) admits owner and admin only', () => {
    expect(canUseHivemind({ role: 'owner', level: 'founder' })).toBe(true);
    expect(canUseHivemind({ role: 'admin', level: 'founder' })).toBe(true);
    expect(canUseHivemind({ role: 'developer', level: 'founder' })).toBe(false);
    expect(canUseHivemind({ role: 'beta_user', level: 'founder' })).toBe(false);
    expect(canUseHivemind({ role: 'standard_user', level: 'founder' })).toBe(false);
  });

  it('privileged level adds developer', () => {
    expect(canUseHivemind({ role: 'developer', level: 'privileged' })).toBe(true);
    expect(canUseHivemind({ role: 'standard_user', level: 'privileged' })).toBe(false);
  });

  it('all level opens it to every account', () => {
    expect(canUseHivemind({ role: 'standard_user', level: 'all' })).toBe(true);
  });

  it('a server-set app_metadata grant admits a single account at any level', () => {
    expect(canUseHivemind({ role: 'standard_user', level: 'founder', appMetadata: { hivemind_access: true } })).toBe(true);
    // Truthy-but-not-true values are not a grant.
    expect(canUseHivemind({ role: 'standard_user', level: 'founder', appMetadata: { hivemind_access: 'yes' } })).toBe(false);
  });
});

describe('account authority exposes canUseHivemind', () => {
  it('founder account (OWNER_EMAIL) can use Hivemind', () => {
    const authority = resolveAccountAuthorityFromAuthUser({ id: 'u1', email: 'Owner@Example.com' });
    expect(authority.isFounderAccount).toBe(true);
    expect(serializeAccountAuthority(authority).canUseHivemind).toBe(true);
  });

  it('a newly signed-up account cannot, by default', () => {
    const authority = resolveAccountAuthorityFromAuthUser({ id: 'u2', email: 'new@example.com' });
    expect(authority.role).toBe('standard_user');
    expect(authority.canUseHivemind).toBe(false);
  });

  it('user_metadata can never grant Hivemind (client-writable)', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'u3',
      email: 'sneaky@example.com',
      user_metadata: { hivemind_access: true, role: 'owner' },
    });
    expect(authority.canUseHivemind).toBe(false);
  });

  it('app_metadata grant enables a standard account', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'u4',
      email: 'beta@example.com',
      app_metadata: { hivemind_access: true },
    });
    expect(authority.role).toBe('standard_user');
    expect(authority.canUseHivemind).toBe(true);
  });
});

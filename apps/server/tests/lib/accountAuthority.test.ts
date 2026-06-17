import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  adminUserId: 'admin-uuid',
  adminEmail: 'admin@example.com',
  ownerUserId: 'owner-uuid',
  ownerEmail: 'founder@example.com',
  developerEmail: 'dev@example.com',
}));

vi.mock('../../src/config', () => ({
  config: mockConfig,
}));

import {
  resolveAccountAuthorityFromAuthUser,
  isFounderAccount,
  serializeAccountAuthority,
  toPublicRole,
  PRIVILEGED_PLATFORM_ROLES,
} from '../../src/lib/accountAuthority';

describe('accountAuthority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves owner by user id with founder flag', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'owner-uuid',
      email: 'founder@example.com',
    });
    expect(authority.role).toBe('owner');
    expect(authority.isFounderAccount).toBe(true);
    expect(authority.isPrivileged).toBe(true);
    expect(authority.canBeBilled).toBe(false);
    expect(authority.canLoseAccess).toBe(false);
    expect(authority.privilegeSource).toBe('platform_authority');
  });

  it('resolves admin with premium privilege', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'other-uuid',
      email: 'admin@example.com',
    });
    expect(authority.role).toBe('admin');
    expect(authority.isPrivileged).toBe(true);
    expect(authority.privilegeSource).toBe('administrative_privilege');
  });

  it('resolves developer by email', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'dev-uuid',
      email: 'dev@example.com',
    });
    expect(authority.role).toBe('developer');
    expect(authority.isPrivileged).toBe(true);
    expect(authority.privilegeSource).toBe('development_privilege');
  });

  it('resolves admin from app_metadata only', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'random-uuid',
      email: 'user@example.com',
      app_metadata: { role: 'admin' },
    });
    expect(authority.role).toBe('admin');
    expect(authority.isPrivileged).toBe(true);
  });

  it('ignores user_metadata.role — no privilege escalation', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'random-uuid',
      email: 'user@example.com',
      user_metadata: { role: 'owner' },
    });
    expect(authority.role).toBe('standard_user');
    expect(authority.isPrivileged).toBe(false);
    expect(authority.canBeBilled).toBe(true);
  });

  it('ignores user_metadata developer role', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'random-uuid',
      email: 'attacker@example.com',
      user_metadata: { role: 'developer' },
    });
    expect(authority.role).toBe('standard_user');
  });

  it('owner supersedes admin email match', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'owner-uuid',
      email: 'admin@example.com',
      app_metadata: { role: 'admin' },
    });
    expect(authority.role).toBe('owner');
  });

  it('defaults to standard_user', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'random-uuid',
      email: 'user@example.com',
    });
    expect(authority.role).toBe('standard_user');
    expect(authority.isPrivileged).toBe(false);
    expect(authority.canBeBilled).toBe(true);
  });

  it('isFounderAccount detects owner targets', () => {
    expect(isFounderAccount('owner-uuid', 'founder@example.com')).toBe(true);
    expect(isFounderAccount('other-uuid', 'user@example.com')).toBe(false);
  });

  it('serializes standard_user as public role user', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'random-uuid',
      email: 'user@example.com',
    });
    const pub = serializeAccountAuthority(authority);
    expect(pub.role).toBe('user');
    expect(pub.canAccessAdmin).toBe(false);
    expect(pub.canBeBilled).toBe(true);
  });

  it('serializes owner with admin and dev console access', () => {
    const authority = resolveAccountAuthorityFromAuthUser({
      id: 'owner-uuid',
      email: 'founder@example.com',
    });
    const pub = serializeAccountAuthority(authority);
    expect(pub.role).toBe('owner');
    expect(pub.canAccessAdmin).toBe(true);
    expect(pub.canAccessDevConsole).toBe(true);
    expect(pub.canBeBilled).toBe(false);
  });

  it('toPublicRole maps standard_user to user', () => {
    expect(toPublicRole('standard_user')).toBe('user');
    expect(toPublicRole('owner')).toBe('owner');
  });

  it('privileged roles include owner admin developer', () => {
    expect(PRIVILEGED_PLATFORM_ROLES).toEqual(['owner', 'admin', 'developer']);
  });
});

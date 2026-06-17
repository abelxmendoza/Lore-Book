import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: {
    enableExperimental: false,
    apiEnv: 'dev',
    adminUserId: 'admin-uuid',
    adminEmail: 'admin@example.com',
    ownerUserId: 'owner-uuid',
    ownerEmail: 'founder@example.com',
    developerEmail: 'dev@example.com',
  },
}));

import { requireAdmin, requireDev } from '../../src/middleware/roleGuard';

describe('server roleGuard helpers', () => {
  describe('requireAdmin', () => {
    it('throws when user is null', () => {
      expect(() => requireAdmin(null)).toThrow('User not authenticated');
    });

    it('allows owner via env identity', () => {
      expect(() => requireAdmin({ id: 'owner-uuid', email: 'founder@example.com' } as any)).not.toThrow();
    });

    it('allows app_metadata admin', () => {
      expect(() => requireAdmin({ id: 'u1', app_metadata: { role: 'admin' } } as any)).not.toThrow();
    });

    it('rejects user_metadata admin — not authoritative', () => {
      expect(() => requireAdmin({ id: 'u1', user_metadata: { role: 'admin' } } as any)).toThrow('Admin role required');
    });

    it('rejects standard user', () => {
      expect(() => requireAdmin({ id: 'u1', email: 'random@example.com' } as any)).toThrow('Admin role required');
    });
  });

  describe('requireDev', () => {
    it('allows in dev environment', () => {
      expect(() => requireDev({ id: 'u1' } as any, { API_ENV: 'dev' })).not.toThrow();
    });

    it('allows app_metadata developer in production', () => {
      expect(() => requireDev({ id: 'u1', app_metadata: { role: 'developer' } } as any, { API_ENV: 'production' })).not.toThrow();
    });

    it('rejects user_metadata developer in production', () => {
      expect(() => requireDev({ id: 'u1', user_metadata: { role: 'developer' } } as any, { API_ENV: 'production' })).toThrow('Dev access required');
    });
  });
});

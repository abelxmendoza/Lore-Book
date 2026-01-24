import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAdmin, requireDev } from '../../src/middleware/roleGuard';

vi.mock('../../src/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../../src/config', () => ({ config: { apiEnv: 'production', adminUserId: 'admin-id' } }));

describe('roleGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('requireAdmin', () => {
    it('should throw when user is null', () => {
      expect(() => requireAdmin(null as any)).toThrow('User not authenticated');
    });

    it('should not throw when user has admin role', () => {
      expect(() => requireAdmin({ id: 'u1', role: 'admin' } as any)).not.toThrow();
    });

    it('should not throw when user has developer role', () => {
      expect(() => requireAdmin({ id: 'u1', user_metadata: { role: 'developer' } } as any)).not.toThrow();
    });

    it('should throw when user has standard role', () => {
      expect(() => requireAdmin({ id: 'u1', role: 'standard_user' } as any)).toThrow('Admin role required');
    });
  });

  describe('requireDev', () => {
    it('should not throw in dev env', () => {
      expect(() => requireDev({ id: 'u1' } as any, { API_ENV: 'dev' })).not.toThrow();
    });

    it('should not throw when user is admin', () => {
      expect(() => requireDev({ id: 'u1', role: 'admin' } as any, { API_ENV: 'production' })).not.toThrow();
    });

    it('should throw when not dev and user is not admin', () => {
      expect(() => requireDev({ id: 'u1', role: 'standard_user' } as any, { API_ENV: 'production' })).toThrow('Dev access required');
    });
  });
});

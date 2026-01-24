import { describe, it, expect } from 'vitest';
import { isAdmin, redirectUnauthorized } from './roleGuard';

describe('roleGuard', () => {
  describe('isAdmin', () => {
    it('returns false for null/undefined user', () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });

    it('returns true when user.user_metadata.role is admin', () => {
      expect(isAdmin({ user_metadata: { role: 'admin' } })).toBe(true);
    });

    it('returns true when user.user_metadata.role is developer', () => {
      expect(isAdmin({ user_metadata: { role: 'developer' } })).toBe(true);
    });

    it('returns true when user.app_metadata.role is admin', () => {
      expect(isAdmin({ app_metadata: { role: 'admin' } })).toBe(true);
    });

    it('returns false for user with no role', () => {
      expect(isAdmin({})).toBe(false);
      expect(isAdmin({ user_metadata: {} })).toBe(false);
    });
  });

  describe('redirectUnauthorized', () => {
    let location: string;

    beforeEach(() => {
      location = '';
      Object.defineProperty(window, 'location', {
        value: { get href() { return location; }, set href(v: string) { location = v; } },
        configurable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sets window.location.href to path', () => {
      redirectUnauthorized('/login');
      expect(window.location.href).toBe('/login');
    });

    it('defaults to / when no path', () => {
      redirectUnauthorized();
      expect(window.location.href).toBe('/');
    });
  });
});

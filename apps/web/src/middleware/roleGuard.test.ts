import { describe, it, expect } from 'vitest';
import { isAdmin, redirectUnauthorized } from './roleGuard';

describe('roleGuard', () => {
  describe('isAdmin', () => {
    it('returns false for null/undefined user', () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });

    it('returns true only for allowed admin email (abelxmendoza@gmail.com)', () => {
      expect(isAdmin({ email: 'abelxmendoza@gmail.com' })).toBe(true);
      expect(isAdmin({ email: 'Abelxmendoza@gmail.com' })).toBe(true);
    });

    it('returns false for other emails and role metadata only', () => {
      expect(isAdmin({ email: 'other@example.com' })).toBe(false);
      expect(isAdmin({ user_metadata: { role: 'admin' } })).toBe(false);
      expect(isAdmin({ app_metadata: { role: 'admin' } })).toBe(false);
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

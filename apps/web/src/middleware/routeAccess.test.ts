import { describe, it, expect } from 'vitest';
import {
  isPublicRoutePath,
  isAdminRoutePath,
  isDevConsoleRoutePath,
  isAppShellRoutePath,
} from './routeAccess';

describe('routeAccess', () => {
  it('marks marketing and auth entry routes as public', () => {
    expect(isPublicRoutePath('/')).toBe(true);
    expect(isPublicRoutePath('/features')).toBe(true);
    expect(isPublicRoutePath('/login')).toBe(true);
    expect(isPublicRoutePath('/upgrade')).toBe(true);
    expect(isPublicRoutePath('/demo')).toBe(true);
  });

  it('does not mark app surfaces as public', () => {
    expect(isPublicRoutePath('/chat')).toBe(false);
    expect(isPublicRoutePath('/home')).toBe(false);
    expect(isPublicRoutePath('/admin')).toBe(false);
  });

  it('identifies admin-only operator routes', () => {
    expect(isAdminRoutePath('/admin')).toBe(true);
    expect(isAdminRoutePath('/ontology')).toBe(true);
    expect(isAdminRoutePath('/intelligence')).toBe(true);
    expect(isAdminRoutePath('/chat')).toBe(false);
  });

  it('identifies dev console route', () => {
    expect(isDevConsoleRoutePath('/dev-console')).toBe(true);
    expect(isDevConsoleRoutePath('/diagnostics/chat')).toBe(true);
    expect(isDevConsoleRoutePath('/chat')).toBe(false);
  });

  it('identifies protected app shell routes', () => {
    expect(isAppShellRoutePath('/home')).toBe(true);
    expect(isAppShellRoutePath('/chat')).toBe(true);
    expect(isAppShellRoutePath('/diagnostics/chat')).toBe(false);
    expect(isAppShellRoutePath('/login')).toBe(false);
    expect(isAppShellRoutePath('/demo')).toBe(false);
  });
});

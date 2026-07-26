import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDemoSession, enterDemoRuntime } from './demoRuntime';

vi.mock('../store/runtimeIdentityCache', () => ({
  getCachedRuntimeIdentity: () => 'REAL_USER',
}));

describe('canCallAuthenticatedApi — demo isolation', () => {
  beforeEach(() => {
    clearDemoSession();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    clearDemoSession();
    window.history.replaceState({}, '', '/');
  });

  it('blocks authenticated API calls on /demo even if identity is REAL_USER', async () => {
    window.history.replaceState({}, '', '/demo');
    const { canCallAuthenticatedApi } = await import('./runtimeIdentity');
    expect(canCallAuthenticatedApi()).toBe(false);
  });

  it('allows authenticated API calls outside demo when identity is REAL_USER', async () => {
    const { canCallAuthenticatedApi } = await import('./runtimeIdentity');
    expect(canCallAuthenticatedApi()).toBe(true);
  });

  it('blocks authenticated API calls when demo session flag is set', async () => {
    enterDemoRuntime();
    window.history.replaceState({}, '', '/chat');
    const { canCallAuthenticatedApi } = await import('./runtimeIdentity');
    expect(canCallAuthenticatedApi()).toBe(false);
  });
});

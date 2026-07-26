import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearDemoSession,
  DEMO_SESSION_KEY,
  enterDemoRuntime,
  isDemoRuntimeActive,
} from './demoRuntime';

describe('demoRuntime isolation', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', originalPath || '/');
  });

  it('is active on /demo even without the session flag', () => {
    window.history.replaceState({}, '', '/demo');
    expect(isDemoRuntimeActive()).toBe(true);
  });

  it('is active when the session flag is set off /demo', () => {
    enterDemoRuntime();
    window.history.replaceState({}, '', '/characters');
    expect(isDemoRuntimeActive()).toBe(true);
    expect(sessionStorage.getItem(DEMO_SESSION_KEY)).toBe('true');
  });

  it('clears the session flag on exit', () => {
    enterDemoRuntime();
    clearDemoSession();
    window.history.replaceState({}, '', '/');
    expect(isDemoRuntimeActive()).toBe(false);
  });

  it('is inactive for normal authenticated app paths without the flag', () => {
    window.history.replaceState({}, '', '/chat');
    expect(isDemoRuntimeActive()).toBe(false);
  });
});

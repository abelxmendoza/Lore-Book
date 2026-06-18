import { describe, it, expect, vi, beforeEach } from 'vitest';

import { store } from './index';
import { registerAppStore } from './appStoreRef';
import {
  getGlobalMockDataEnabled,
  setGlobalMockDataEnabled,
  getIsUserLoggedIn,
  getGlobalIsGuest,
  setGlobalIsGuest,
  notifyBackendReachable,
  subscribeToMockDataState,
  subscribeToBackendReachable,
  bindRuntimeAccess,
  resetRuntimeAccessForTests,
} from './runtimeAccess';
import { setAuthSession } from './slices/authSlice';
import { setBackendStatus, setIsGuest, setUseMockData } from './slices/runtimeSlice';

describe('runtimeAccess', () => {
  beforeEach(() => {
    registerAppStore(store);
    resetRuntimeAccessForTests();
    bindRuntimeAccess();
    store.dispatch(setAuthSession({ user: null, session: null }));
    store.dispatch(setBackendStatus({ unavailable: false, health: null }));
    store.dispatch(setIsGuest(false));
    store.dispatch(setUseMockData(false));
  });

  it('reads and writes mock data through the store', () => {
    setGlobalMockDataEnabled(true);
    expect(getGlobalMockDataEnabled()).toBe(true);
    setGlobalMockDataEnabled(false);
    expect(getGlobalMockDataEnabled()).toBe(false);
  });

  it('auth-gates mock data for logged-in users', () => {
    store.dispatch(setUseMockData(true));
    store.dispatch(
      setAuthSession({
        user: { id: 'u1' } as never,
        session: { user: { id: 'u1' } } as never,
      }),
    );
    expect(getGlobalMockDataEnabled()).toBe(false);
  });

  it('reads auth and guest flags from store slices', () => {
    expect(getIsUserLoggedIn()).toBe(false);
    store.dispatch(setAuthSession({ user: { id: 'u1' } as never, session: null }));
    expect(getIsUserLoggedIn()).toBe(true);

    store.dispatch(setIsGuest(true));
    expect(getGlobalIsGuest()).toBe(true);
  });

  it('notifies mock-data subscribers on toggle', () => {
    const listener = vi.fn();
    const unsub = subscribeToMockDataState(listener);
    setGlobalMockDataEnabled(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsub();
  });

  it('notifies backend-reachable subscribers when health clears', () => {
    store.dispatch(setBackendStatus({ unavailable: true, health: { ok: false } as never }));
    const listener = vi.fn();
    const unsub = subscribeToBackendReachable(listener);
    notifyBackendReachable();
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

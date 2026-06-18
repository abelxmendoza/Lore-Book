import { describe, it, expect } from 'vitest';

import {
  selectActiveSurface,
  selectMobileDrawerOpen,
  selectSelectedEntity,
  selectEntityModalOpen,
  selectCurrentContext,
  selectRuntimeIdentity,
  selectUseMockData,
  selectIsRealUser,
  selectActiveThreadId,
  selectCurrentThreadId,
  selectThreadError,
  selectAuthUser,
  selectAuthLoading,
  selectIsAuthenticated,
} from './selectors';
import { setRuntimeIdentity, setUseMockData } from './slices/runtimeSlice';
import { setAuthSession } from './slices/authSlice';
import { openEntity, setCurrentContext } from './slices/selectionSlice';
import { setActiveThreadId, setCurrentThreadId, setThreadError } from './slices/chatSlice';
import { setActiveSurface, setMobileDrawerOpen } from './slices/uiSlice';

import { makeStore } from './index';

describe('store selectors', () => {
  it('reads UI state', () => {
    const store = makeStore();
    store.dispatch(setActiveSurface('timeline'));
    store.dispatch(setMobileDrawerOpen(true));
    expect(selectActiveSurface(store.getState())).toBe('timeline');
    expect(selectMobileDrawerOpen(store.getState())).toBe(true);
  });

  it('reads selection state', () => {
    const store = makeStore();
    store.dispatch(openEntity({ type: 'character', id: 'c1', name: 'Ada' }));
    store.dispatch(setCurrentContext({ kind: 'thread', threadId: 't1' }));
    expect(selectSelectedEntity(store.getState())).toMatchObject({ id: 'c1' });
    expect(selectEntityModalOpen(store.getState())).toBe(true);
    expect(selectCurrentContext(store.getState())).toEqual({ kind: 'thread', threadId: 't1' });
  });

  it('derives isRealUser from runtime identity', () => {
    const store = makeStore();
    expect(selectIsRealUser(store.getState())).toBe(false);
    store.dispatch(setRuntimeIdentity('REAL_USER'));
    expect(selectRuntimeIdentity(store.getState())).toBe('REAL_USER');
    expect(selectIsRealUser(store.getState())).toBe(true);
    store.dispatch(setUseMockData(true));
    expect(selectUseMockData(store.getState())).toBe(true);
  });

  it('supports preloaded state', () => {
    const store = makeStore({ ui: { activeSurface: 'love', mobileDrawerOpen: false, devMode: true } });
    expect(selectActiveSurface(store.getState())).toBe('love');
  });

  it('reads chat thread selection and errors', () => {
    const store = makeStore();
    store.dispatch(setActiveThreadId('active'));
    store.dispatch(setCurrentThreadId('current'));
    store.dispatch(setThreadError('load failed'));
    expect(selectActiveThreadId(store.getState())).toBe('active');
    expect(selectCurrentThreadId(store.getState())).toBe('current');
    expect(selectThreadError(store.getState())).toBe('load failed');
  });

  it('reads auth session state', () => {
    const store = makeStore();
    expect(selectAuthLoading(store.getState())).toBe(true);
    expect(selectIsAuthenticated(store.getState())).toBe(false);

    const user = { id: 'u1', email: 'a@b.c' } as never;
    store.dispatch(setAuthSession({ user, session: { user } as never }));
    expect(selectAuthUser(store.getState())).toBe(user);
    expect(selectAuthLoading(store.getState())).toBe(false);
    expect(selectIsAuthenticated(store.getState())).toBe(true);
  });
});

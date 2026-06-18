import { describe, it, expect } from 'vitest';

import {
  authReducer,
  initialAuthState,
  resetAuth,
  setAuthConfigured,
  setAuthLoading,
  setAuthSession,
} from './authSlice';

describe('authSlice', () => {
  it('starts in loading state with no user', () => {
    expect(initialAuthState).toEqual({
      user: null,
      session: null,
      loading: true,
      isConfigured: false,
    });
  });

  it('records configured flag', () => {
    const state = authReducer(initialAuthState, setAuthConfigured(true));
    expect(state.isConfigured).toBe(true);
  });

  it('stores session and clears loading', () => {
    const user = { id: 'u1', email: 'a@b.c' } as never;
    const session = { user, access_token: 'tok' } as never;
    const state = authReducer(initialAuthState, setAuthSession({ user, session }));
    expect(state.user).toBe(user);
    expect(state.session).toBe(session);
    expect(state.loading).toBe(false);
  });

  it('clears user on sign-out session', () => {
    const user = { id: 'u1' } as never;
    let state = authReducer(initialAuthState, setAuthSession({ user, session: { user } as never }));
    state = authReducer(state, setAuthSession({ user: null, session: null }));
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('resetAuth returns to signed-out ready state', () => {
    const user = { id: 'u1' } as never;
    let state = authReducer(initialAuthState, setAuthSession({ user, session: { user } as never }));
    state = authReducer(state, resetAuth());
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('setAuthLoading toggles loading independently', () => {
    let state = authReducer(initialAuthState, setAuthLoading(false));
    expect(state.loading).toBe(false);
    state = authReducer(state, setAuthLoading(true));
    expect(state.loading).toBe(true);
  });
});

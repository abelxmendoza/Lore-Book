import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
  isSupabaseConfigured: vi.fn(),
}));

import { isSupabaseConfigured } from '../lib/supabase';

import { bindSupabaseAuth, resetAuthBindingForTests } from './authSync';
import { makeStore } from './index';
import { selectAuthLoading, selectAuthSession, selectAuthUser, selectIsAuthenticated } from './selectors';

const mockedConfigured = vi.mocked(isSupabaseConfigured);

describe('bindSupabaseAuth', () => {
  beforeEach(() => {
    resetAuthBindingForTests();
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockUnsubscribe.mockReset();
    mockedConfigured.mockReset();

    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  it('marks unconfigured Supabase as signed-out without subscribing', () => {
    mockedConfigured.mockReturnValue(false);
    const store = makeStore();

    bindSupabaseAuth(store.dispatch);

    expect(store.getState().auth.isConfigured).toBe(false);
    expect(selectAuthUser(store.getState())).toBeNull();
    expect(selectAuthLoading(store.getState())).toBe(false);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
  });

  it('hydrates initial session into the auth slice', async () => {
    mockedConfigured.mockReturnValue(true);
    const user = { id: 'user-1', email: 'x@y.z' };
    const session = { user, access_token: 'abc' };
    mockGetSession.mockResolvedValue({ data: { session } });

    const store = makeStore();
    bindSupabaseAuth(store.dispatch);

    await vi.waitFor(() => {
      expect(selectAuthUser(store.getState())).toEqual(user);
    });

    expect(selectAuthSession(store.getState())).toEqual(session);
    expect(selectAuthLoading(store.getState())).toBe(false);
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('applies onAuthStateChange updates', async () => {
    mockedConfigured.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ data: { session: null } });

    let changeHandler: ((event: string, session: unknown) => void) | undefined;
    mockOnAuthStateChange.mockImplementation((handler) => {
      changeHandler = handler;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const store = makeStore();
    bindSupabaseAuth(store.dispatch);

    await vi.waitFor(() => {
      expect(selectAuthLoading(store.getState())).toBe(false);
    });

    const user = { id: 'user-2' };
    changeHandler?.('SIGNED_IN', { user, access_token: 'tok' });

    expect(selectAuthUser(store.getState())).toEqual(user);

    changeHandler?.('SIGNED_OUT', null);
    expect(selectAuthUser(store.getState())).toBeNull();
  });

  it('unsubscribes on cleanup', async () => {
    mockedConfigured.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const store = makeStore();
    const unbind = bindSupabaseAuth(store.dispatch);

    await vi.waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    unbind();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

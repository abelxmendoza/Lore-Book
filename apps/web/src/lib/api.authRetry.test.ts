import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    },
  },
}));

vi.mock('./security', () => ({
  addCsrfHeaders: (h: Record<string, string>) => h,
  acquireCsrfToken: vi.fn().mockResolvedValue(undefined),
  getCsrfToken: () => 'csrf',
  invalidateCsrfToken: vi.fn(),
}));

vi.mock('../config/env', () => ({
  config: {
    api: { url: '', timeout: 5000 },
    logging: { logApiCalls: false, logPerformance: false },
    env: { isProduction: false, isDevelopment: true },
    dev: { allowMockData: false, verboseErrors: false },
  },
  log: { debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('./monitoring', () => ({
  performance: { trackApiCall: vi.fn() },
  errorTracking: {},
}));

vi.mock('./cache', () => ({
  apiCache: {
    get: () => null,
    getInflight: () => null,
    set: vi.fn(),
    deletePattern: vi.fn(),
    trackInflight: vi.fn(),
  },
  generateCacheKey: () => 'key',
}));

vi.mock('./errorHandler', () => ({
  handleError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
  createAppError: (msg: string) => new Error(msg),
  retryWithBackoff: vi.fn(),
}));

vi.mock('../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => false,
  getBackendUnavailable: () => false,
  notifyBackendReachable: vi.fn(),
}));

import { fetchJson } from './api';
import { supabase } from './supabase';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockSession(token: string | null) {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
    error: null,
  } as never);
}

describe('fetchJson 401 self-heal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes the session on 401 and retries once with the fresh token', async () => {
    mockSession('stale-token');
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    } as never);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid session' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson<{ ok: boolean }>('/api/entries');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    const retryHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe('Bearer stale-token');
    expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('surfaces the session-expired error when refresh fails', async () => {
    mockSession('stale-token');
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: { session: null },
      error: { message: 'refresh_token_not_found' },
    } as never);

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'Invalid session' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('/api/entries')).rejects.toThrow(/session expired/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh for unauthenticated (tokenless) requests', async () => {
    mockSession(null);

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'Missing Authorization header' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('/api/entries')).rejects.toThrow();
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent refreshes: a burst of 401s triggers one refresh call', async () => {
    mockSession('stale-token');
    let resolveRefresh: (v: unknown) => void = () => {};
    vi.mocked(supabase.auth.refreshSession).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }) as never,
    );

    const fetchMock = vi.fn((url: string, initArg: RequestInit) => {
      const auth = (initArg.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        auth === 'Bearer fresh-token'
          ? jsonResponse(200, { ok: true })
          : jsonResponse(401, { error: 'Invalid session' }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const requests = Promise.all([
      fetchJson('/api/a'),
      fetchJson('/api/b'),
      fetchJson('/api/c'),
    ]);
    // Let both requests hit their 401s and call the (pending) refresh.
    await new Promise((r) => setTimeout(r, 10));
    resolveRefresh({ data: { session: { access_token: 'fresh-token' } }, error: null });

    await expect(requests).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
  });
});

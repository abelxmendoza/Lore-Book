import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config and dependencies before importing fetchJson
vi.mock('../config/env', () => ({
  config: {
    api: { url: '', timeout: 10000 },
    dev: { allowMockData: true, verboseErrors: true },
    env: { isDevelopment: true },
    logging: { logApiCalls: false, logPerformance: false },
    prod: { enableErrorReporting: false },
  },
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  },
}));

vi.mock('./security', () => ({
  addCsrfHeaders: (headers: Record<string, string>) => headers,
}));

vi.mock('./monitoring', () => ({
  performance: { trackApiCall: vi.fn() },
  errorTracking: { captureException: vi.fn(), enableErrorTracking: false },
}));

vi.mock('./cache', () => ({
  apiCache: { get: () => null, set: vi.fn(), deletePattern: vi.fn() },
  generateCacheKey: (u: string) => u,
}));

vi.mock('../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => true,
  getBackendUnavailable: vi.fn(() => false),
}));

describe('fetchJson', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns mockData when backend returns 500 and useMockData/mockData are provided', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Backend down' }),
        text: async () => '',
        headers: new Headers(),
      } as Response)
    );

    const { fetchJson } = await import('./api');
    const mockPayload = { entries: [] };
    const result = await fetchJson<{ entries: unknown[] }>('/api/entries', undefined, {
      useMockData: true,
      mockData: mockPayload,
    });

    expect(result).toEqual(mockPayload);
    expect(result.entries).toEqual([]);
  });

  it('returns mockData without fetching when backend is known unavailable and mockData is provided', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const { getBackendUnavailable } = await import('../contexts/MockDataContext');
    vi.mocked(getBackendUnavailable).mockReturnValue(true);

    const { fetchJson } = await import('./api');
    const mockPayload = { entries: [] };
    const result = await fetchJson<{ entries: unknown[] }>('/api/entries', undefined, {
      useMockData: true,
      mockData: mockPayload,
    });

    expect(result).toEqual(mockPayload);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.mocked(getBackendUnavailable).mockReturnValue(false);
  });

  it('throws when backend returns 500 and no mockData is provided', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Backend down' }),
        text: async () => '',
        headers: new Headers(),
      } as Response)
    );

    const { fetchJson } = await import('./api');
    await expect(
      fetchJson<{ entries: unknown[] }>('/api/entries')
    ).rejects.toThrow();
  });
});

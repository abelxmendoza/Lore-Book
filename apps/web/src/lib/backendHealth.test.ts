import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkBackendHealth,
  describeBackendHealthFailure,
  resolveHealthUrl,
} from './backendHealth';

describe('backendHealth', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves a health URL from an API base', () => {
    expect(resolveHealthUrl('https://api.example.com/')).toBe('https://api.example.com/api/health');
    expect(resolveHealthUrl('', 'https://app.example.com')).toBe('https://app.example.com/api/health');
  });

  it('classifies 502 responses as backend host failures', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers(),
      } as Response)
    );

    const result = await checkBackendHealth('https://lore-book-production.up.railway.app');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('http_error');
      expect(result.status).toBe(502);
      expect(describeBackendHealthFailure(result)).toContain('Backend host responded 502');
    }
  });

  it('classifies browser fetch failures as network or CORS failures', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    const result = await checkBackendHealth('https://lore-book-production.up.railway.app');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('network_or_cors');
      expect(describeBackendHealthFailure(result)).toContain('Browser could not read');
    }
  });
});

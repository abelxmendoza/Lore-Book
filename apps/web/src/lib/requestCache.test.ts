import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({ fetchJson: vi.fn() }));

import { fetchJson } from './api';
import { cachedFetchJson, invalidateCache } from './requestCache';

const mockFetch = fetchJson as unknown as ReturnType<typeof vi.fn>;

describe('cachedFetchJson', () => {
  beforeEach(() => {
    invalidateCache(); // clear all between tests
    mockFetch.mockReset();
  });

  it('fetches once and serves subsequent reads from cache', async () => {
    mockFetch.mockResolvedValue({ id: 'x' });

    const a = await cachedFetchJson('/api/characters/x');
    const b = await cachedFetchJson('/api/characters/x');

    expect(a).toEqual({ id: 'x' });
    expect(b).toEqual({ id: 'x' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent in-flight reads into a single request', async () => {
    let resolve!: (v: unknown) => void;
    mockFetch.mockReturnValue(new Promise((r) => { resolve = r; }));

    const p1 = cachedFetchJson('/api/characters/y');
    const p2 = cachedFetchJson('/api/characters/y');
    resolve({ id: 'y' });

    expect(await p1).toEqual({ id: 'y' });
    expect(await p2).toEqual({ id: 'y' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches once the entry is older than the TTL', async () => {
    mockFetch.mockResolvedValue({ id: 'z' });

    await cachedFetchJson('/api/characters/z', { ttlMs: 50 });
    await new Promise((r) => setTimeout(r, 60));
    await cachedFetchJson('/api/characters/z', { ttlMs: 50 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('force bypasses a fresh cached value', async () => {
    mockFetch.mockResolvedValue({ id: 'f' });

    await cachedFetchJson('/api/characters/f');
    await cachedFetchJson('/api/characters/f', { force: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('invalidateCache(substr) drops only matching keys', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await cachedFetchJson('/api/characters/abel');
    await cachedFetchJson('/api/characters/kelly');
    invalidateCache('abel');

    await cachedFetchJson('/api/characters/abel'); // refetch
    await cachedFetchJson('/api/characters/kelly'); // still cached

    expect(mockFetch).toHaveBeenCalledTimes(3); // 2 initial + 1 refetch for abel
  });
});

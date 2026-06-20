import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  clearLoreBookParseSharedCache,
  fetchLoreBookParseShared,
} from './loreBookParseCache';

const mockFetch = vi.fn();

vi.mock('../api/loreBookParse', () => ({
  fetchLoreBookParse: (...args: unknown[]) => mockFetch(...args),
}));

describe('loreBookParseCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLoreBookParseSharedCache();
    mockFetch.mockResolvedValue({
      operations: [],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 0,
    });
  });

  afterEach(() => {
    clearLoreBookParseSharedCache();
  });

  it('dedupes concurrent requests for the same text', async () => {
    const p1 = fetchLoreBookParseShared('hello world');
    const p2 = fetchLoreBookParseShared('hello world');
    expect(p1).toBe(p2);
    await p1;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses separate cache keys per threadId', async () => {
    await fetchLoreBookParseShared('hello', 'thread-a');
    await fetchLoreBookParseShared('hello', 'thread-b');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('propagates fetch errors to callers', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    await expect(fetchLoreBookParseShared('fail me')).rejects.toThrow('network');
  });
});

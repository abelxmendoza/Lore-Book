import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Heavy module-load deps mocked so importing the service does not open clients.
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));
vi.mock('../../src/services/embeddingService', () => ({
  embeddingService: { embedText: vi.fn() },
}));
vi.mock('openai', () => ({ default: function OpenAI() { return { chat: { completions: { create: vi.fn() } } }; } }));
vi.mock('../../src/config', () => ({ config: { openAiKey: 'test-key', defaultModel: 'gpt-4o-mini' } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  readCache,
  writeCache,
  __ingestCacheInternals,
} from '../../src/services/omegaMemoryService';

describe('ingestion dedup cache (Phase A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a stored value within the TTL window', () => {
    const cache = new Map<string, { at: number; value: number }>();
    writeCache(cache, 'k', 42);
    expect(readCache(cache, 'k')).toBe(42);
  });

  it('expires entries after the TTL and evicts the stale key', () => {
    const cache = new Map<string, { at: number; value: string }>();
    writeCache(cache, 'k', 'v');

    vi.advanceTimersByTime(__ingestCacheInternals.ttlMs + 1);

    expect(readCache(cache, 'k')).toBeUndefined();
    // stale key is dropped on read so the map does not grow unbounded
    expect(cache.has('k')).toBe(false);
  });

  it('returns undefined for unknown keys', () => {
    const cache = new Map<string, { at: number; value: number }>();
    expect(readCache(cache, 'missing')).toBeUndefined();
  });

  it('caps the map at the configured maximum', () => {
    const cache = new Map<string, { at: number; value: number }>();
    for (let i = 0; i < __ingestCacheInternals.maxEntries + 50; i++) {
      writeCache(cache, `k${i}`, i);
    }
    expect(cache.size).toBeLessThanOrEqual(__ingestCacheInternals.maxEntries);
  });
});

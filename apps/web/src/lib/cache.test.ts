import { describe, it, expect, beforeEach } from 'vitest';
import { generateCacheKey, apiCache } from './cache';

describe('generateCacheKey', () => {
  it('generates key from url only', () => {
    expect(generateCacheKey('/api/foo')).toBe('GET:/api/foo:');
  });

  it('includes method', () => {
    expect(generateCacheKey('/api/foo', { method: 'POST' })).toBe('POST:/api/foo:');
  });

  it('includes body when provided', () => {
    expect(generateCacheKey('/api/foo', { method: 'POST', body: '{"x":1}' })).toBe('POST:/api/foo:{"x":1}');
  });
});

describe('apiCache', () => {
  beforeEach(() => {
    apiCache.clear();
  });

  it('returns null for missing key', () => {
    expect(apiCache.get('missing')).toBeNull();
  });

  it('returns value after set', () => {
    apiCache.set('k1', { a: 1 });
    expect(apiCache.get('k1')).toEqual({ a: 1 });
  });

  it('returns null after delete', () => {
    apiCache.set('k1', 1);
    apiCache.delete('k1');
    expect(apiCache.get('k1')).toBeNull();
  });

  it('clear removes all', () => {
    apiCache.set('a', 1);
    apiCache.set('b', 2);
    apiCache.clear();
    expect(apiCache.get('a')).toBeNull();
    expect(apiCache.get('b')).toBeNull();
  });

  it('deletePattern with string regex', () => {
    apiCache.set('GET:/api/a:1', 1);
    apiCache.set('GET:/api/b:2', 2);
    apiCache.set('GET:/other/x:3', 3);
    apiCache.deletePattern('/api/.*');
    expect(apiCache.get('GET:/api/a:1')).toBeNull();
    expect(apiCache.get('GET:/api/b:2')).toBeNull();
    expect(apiCache.get('GET:/other/x:3')).toEqual(3);
  });

  it('getStats returns counts', () => {
    apiCache.clear();
    apiCache.set('k1', 1);
    apiCache.set('k2', 2);
    const s = apiCache.getStats();
    expect(s.total).toBe(2);
    expect(s.active).toBe(2);
  });
});

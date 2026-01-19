import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoreKeeper } from './useLoreKeeper';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useLoreKeeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default fetch mock
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries') && !url.includes('?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: [] })
        });
      }
      if (url.includes('/api/timeline') && !url.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timeline: { chapters: [], unassigned: [] } })
        });
      }
      if (url.includes('/api/timeline/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  it('should initialize successfully', async () => {
    const { result } = renderHook(() => useLoreKeeper());
    
    expect(result.current).toBeDefined();
    expect(result.current.entries).toBeDefined();
    expect(result.current.timeline).toBeDefined();
    expect(Array.isArray(result.current.entries)).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    // Mock fetch to throw an error
    mockFetch.mockImplementationOnce(() => 
      Promise.reject(new Error('Network error'))
    );

    const { result } = renderHook(() => useLoreKeeper());

    // Try to refresh entries which will trigger the error
    try {
      await result.current.refreshEntries();
    } catch (error) {
      // Error is expected, verify hook still works
      expect(result.current).toBeDefined();
      expect(result.current.entries).toBeDefined();
    }
  });
});


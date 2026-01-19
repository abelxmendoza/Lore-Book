import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoreKeeper } from './useLoreKeeper';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  },
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getConfigDebug: vi.fn().mockReturnValue({})
}));

// Mock fetchJson to prevent real network requests
vi.mock('../lib/api', () => ({
  fetchJson: vi.fn()
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useLoreKeeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default fetch mock - useLoreKeeper has its own fetchJson that uses fetch
    mockFetch.mockImplementation((url: string | Request) => {
      const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes('/api/entries') && !urlString.includes('?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: [] })
        });
      }
      if (urlString.includes('/api/timeline') && !urlString.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timeline: { chapters: [], unassigned: [] } })
        });
      }
      if (urlString.includes('/api/timeline/tags')) {
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
    
    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toBeDefined();
      expect(result.current.timeline).toBeDefined();
      expect(Array.isArray(result.current.entries)).toBe(true);
    }, { timeout: 2000 });
  });

  it('should handle errors gracefully', async () => {
    // Mock fetch to throw an error - useLoreKeeper uses its own fetchJson that calls fetch
    mockFetch.mockImplementationOnce(() => 
      Promise.reject(new Error('Network error'))
    );

    const { result } = renderHook(() => useLoreKeeper());

    // Try to refresh entries which will trigger the error
    await result.current.refreshEntries();
    
    // Error should be handled, verify hook still works
    expect(result.current).toBeDefined();
    expect(result.current.entries).toBeDefined();
    expect(result.current.entries).toEqual([]); // Should default to empty array on error
  });
});


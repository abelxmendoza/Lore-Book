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

describe('useLoreKeeper Error Handling', () => {
  const mockFetch = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    // Default mock - return empty data
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

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toBeDefined();
    }, { timeout: 2000 });

    // Should default to empty arrays on error
    expect(result.current.entries).toEqual([]);
  });

  it('should handle 500 server errors', async () => {
    mockFetch.mockImplementation((url: string | Request) => {
      const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes('/api/entries') || urlString.includes('/api/timeline')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Server error' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    // Should handle error gracefully
    await result.current.refreshEntries();
    expect(result.current.entries).toEqual([]);
  });

  it('should handle empty responses gracefully', async () => {
    mockFetch.mockImplementation((url: string | Request) => {
      const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes('/api/entries') && !urlString.includes('?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: null })
        });
      }
      if (urlString.includes('/api/timeline') && !urlString.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timeline: null })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });

    const { result } = renderHook(() => useLoreKeeper());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    }, { timeout: 2000 });

    // Should handle null responses
    expect(result.current.entries).toBeDefined();
  });
});


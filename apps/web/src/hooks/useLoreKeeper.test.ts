import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MockDataProvider } from '../contexts/MockDataContext';
import { useLoreKeeper } from './useLoreKeeper';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MockDataProvider, null, children);

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

// Mock fetch - use a more robust mock that handles all cases
const mockFetch = vi.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('useLoreKeeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage to ensure no cached data
    localStorage.clear();
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
    const { result } = renderHook(() => useLoreKeeper(), { wrapper });
    
    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toBeDefined();
      expect(result.current.timeline).toBeDefined();
      expect(Array.isArray(result.current.entries)).toBe(true);
    }, { timeout: 2000 });
  });

  it('should handle errors gracefully', async () => {
    // Clear localStorage to ensure no cached data
    localStorage.clear();
    
    // Mock fetch to throw an error when refreshEntries is called manually
    // The hook calls refreshEntries on mount (first call), then we call it manually (second call)
    let entriesCallCount = 0;
    
    // Reset mock for this test
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string | Request) => {
      const urlString = typeof url === 'string' ? url : url.url;
      
      // Track entries calls separately
      if (urlString.includes('/api/entries') && !urlString.includes('?')) {
        entriesCallCount++;
        // Fail on the second call (when refreshEntries is called manually)
        if (entriesCallCount === 2) {
          return Promise.reject(new Error('Network error'));
        }
        // First call (on mount) succeeds with empty entries
        return Promise.resolve({
          ok: true,
          json: async () => ({ entries: [] }),
          clone: function() { return this; }
        } as Response);
      }
      
      if (urlString.includes('/api/timeline') && !urlString.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ timeline: { chapters: [], unassigned: [] } }),
          clone: function() { return this; }
        } as Response);
      }
      if (urlString.includes('/api/timeline/tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tags: [] }),
          clone: function() { return this; }
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        clone: function() { return this; }
      } as Response);
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    // Wait for initial load to complete - entries should be empty after mount
    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toBeDefined();
      // Wait for entries to be empty (initial load completes)
      expect(result.current.entries).toEqual([]);
    }, { timeout: 3000 });
    
    // Verify initial state is empty (first call completed successfully)
    expect(result.current.entries).toEqual([]);

    // Now manually call refreshEntries which will trigger the error (second call)
    await result.current.refreshEntries();
    
    // Wait for error handling to complete - entries should be set to empty array on error
    await waitFor(() => {
      expect(result.current.entries).toEqual([]);
    }, { timeout: 1000 });
    
    // Verify hook still works after error
    expect(result.current).toBeDefined();
    expect(result.current.entries).toBeDefined();
    expect(result.current.entries).toEqual([]);
  });
});


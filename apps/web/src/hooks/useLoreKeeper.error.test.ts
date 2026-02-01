import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MockDataProvider } from '../contexts/MockDataContext';
import { useLoreKeeper } from './useLoreKeeper';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MockDataProvider, null, children);

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  },
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getConfigDebug: vi.fn().mockReturnValue({})
}));

const mockFetchJson = vi.fn();
vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args)
}));

const EMPTY_TIMELINE = { chapters: [], unassigned: [] };

describe('useLoreKeeper Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle network errors', async () => {
    mockFetchJson.mockImplementation(() => Promise.reject(new Error('Network error')));

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toEqual([]);
      expect(result.current.timeline).toEqual(EMPTY_TIMELINE);
    }, { timeout: 5000 });
  });

  it('should handle 500 server errors', async () => {
    mockFetchJson.mockImplementation((url: string | RequestInfo) => {
      const urlString = typeof url === 'string' ? url : (url as Request).url;
      if (urlString.includes('/api/entries') || urlString.includes('/api/timeline') || urlString.includes('/api/chapters') || urlString.includes('/api/evolution')) {
        return Promise.reject(new Error('Server error'));
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toEqual([]);
      expect(result.current.timeline).toEqual(EMPTY_TIMELINE);
    }, { timeout: 5000 });
  });

  it('should handle empty responses gracefully', async () => {
    mockFetchJson.mockImplementation((url: string | RequestInfo) => {
      const urlString = typeof url === 'string' ? url : (url as Request).url;
      if (urlString.includes('/api/entries') && !urlString.includes('?')) {
        return Promise.resolve({ entries: null });
      }
      if (urlString.includes('/api/timeline') && !urlString.includes('tags')) {
        return Promise.resolve({ timeline: EMPTY_TIMELINE });
      }
      if (urlString.includes('/api/timeline/tags')) {
        return Promise.resolve({ tags: [] });
      }
      if (urlString.includes('/api/chapters')) {
        return Promise.resolve({ chapters: [] });
      }
      if (urlString.includes('/api/evolution')) {
        return Promise.resolve({ insights: null });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(Array.isArray(result.current.entries)).toBe(true);
      expect(result.current.timeline).toBeDefined();
      expect(result.current.timeline.chapters).toBeDefined();
      expect(result.current.timeline.unassigned).toBeDefined();
    }, { timeout: 5000 });
  });
});


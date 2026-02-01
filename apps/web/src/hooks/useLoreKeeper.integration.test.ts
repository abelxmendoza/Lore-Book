import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  }
}));

const mockFetchJson = vi.fn();
vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args)
}));

const EMPTY_TIMELINE = { chapters: [], unassigned: [] };

function defaultMock(url: string | RequestInfo, init?: RequestInit): Promise<unknown> {
  const urlString = typeof url === 'string' ? url : (url as Request).url;
  if (urlString.includes('/api/entries') && init?.method === 'POST') {
    return Promise.resolve({ entry: { id: 'new-entry', content: 'New entry', date: new Date().toISOString(), tags: [], source: 'manual' } });
  }
  if (urlString.includes('/api/entries') && !urlString.includes('?')) {
    return Promise.resolve({ entries: [] });
  }
  if (urlString.includes('/api/timeline') && !urlString.includes('tags')) {
    return Promise.resolve({ timeline: EMPTY_TIMELINE });
  }
  if (urlString.includes('/api/timeline/tags')) {
    return Promise.resolve({ tags: [] });
  }
  if (urlString.includes('/api/chapters')) {
    return Promise.resolve({ chapters: [], candidates: [] });
  }
  if (urlString.includes('/api/evolution')) {
    return Promise.resolve({ insights: null });
  }
  return Promise.resolve({});
}

describe('useLoreKeeper Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetchJson.mockImplementation((url: string | RequestInfo, init?: RequestInit) => defaultMock(url, init));
  });

  it('should initialize with empty state', async () => {
    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current.entries).toEqual([]);
      expect(result.current.timeline).toEqual(EMPTY_TIMELINE);
    }, { timeout: 3000 });
    expect(result.current.loading).toBe(false);
  });

  it('should load entries on mount', async () => {
    mockFetchJson.mockImplementation((url: string | RequestInfo) => {
      const urlString = typeof url === 'string' ? url : (url as Request).url;
      if (urlString.includes('/api/entries') && !urlString.includes('?')) {
        return Promise.resolve({
          entries: [{ id: '1', content: 'Test entry', date: new Date().toISOString(), tags: [], source: 'manual' }]
        });
      }
      return defaultMock(url);
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current.entries.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
    expect(result.current.entries[0]?.content).toBe('Test entry');
  });

  it('should create a new entry', async () => {
    const mockEntry = { id: 'new-entry', content: 'New entry', date: new Date().toISOString(), tags: [], source: 'manual' };
    mockFetchJson.mockImplementation((url: string | RequestInfo, init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : (url as Request).url;
      if (urlString.includes('/api/entries') && init?.method === 'POST') {
        return Promise.resolve({ entry: mockEntry });
      }
      return defaultMock(url, init);
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current.entries).toBeDefined();
    }, { timeout: 2000 });

    const newEntry = await result.current.createEntry('New entry');

    expect(newEntry).toBeDefined();
    expect(newEntry.content).toBe('New entry');
    await waitFor(() => {
      expect(result.current.entries[0]?.id).toBe('new-entry');
    }, { timeout: 2000 });
  });
});

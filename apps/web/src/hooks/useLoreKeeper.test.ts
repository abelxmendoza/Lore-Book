import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MockDataProvider } from '../contexts/MockDataContext';
import { LoreKeeperProvider } from '../contexts/LoreKeeperContext';
import { ReduxProvider } from '../store/ReduxProvider';
import { useLoreKeeper } from './useLoreKeeper';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    ReduxProvider,
    null,
    React.createElement(
      MockDataProvider,
      null,
      React.createElement(LoreKeeperProvider, null, children)
    )
  );

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false, signOut: vi.fn() })),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getConfigDebug: vi.fn().mockReturnValue({}),
}));

vi.mock('../contexts/MockDataContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/MockDataContext')>();
  return {
    ...actual,
    useMockData: vi.fn(() => ({
      useMockData: false,
      isMockDataActive: false,
      backendUnavailable: false,
      backendHealth: null,
      toggleMockData: vi.fn(),
      setUseMockData: vi.fn(),
      setIsMockDataActive: vi.fn(),
      runtimeIdentity: 'REAL_USER' as const,
      runtimeDataMode: 'REAL' as const,
    })),
  };
});

// Mock fetchJson to prevent real network requests — hook uses fetchJson, not fetch
const mockFetchJson = vi.fn();
vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args)
}));

const EMPTY_TIMELINE = { chapters: [], unassigned: [] };

function defaultFetchJsonMock(url: string | RequestInfo): Promise<unknown> {
  const urlString = typeof url === 'string' ? url : (url as Request).url;
  if (urlString.includes('/api/entries') && !urlString.includes('?') && !(urlString as string).includes('POST')) {
    return Promise.resolve({ entries: [] });
  }
  if (urlString.includes('/api/timeline') && !(urlString as string).includes('tags')) {
    return Promise.resolve({ timeline: EMPTY_TIMELINE });
  }
  if ((urlString as string).includes('/api/timeline/tags')) {
    return Promise.resolve({ tags: [] });
  }
  if ((urlString as string).includes('/api/chapters') && !(urlString as string).includes('/summary')) {
    return Promise.resolve({ chapters: [], candidates: [] });
  }
  if ((urlString as string).includes('/api/evolution')) {
    return Promise.resolve({ insights: null });
  }
  return Promise.resolve({});
}

describe('useLoreKeeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetchJson.mockImplementation((url: string | RequestInfo) => defaultFetchJsonMock(url));
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
    localStorage.clear();
    let entriesCallCount = 0;
    mockFetchJson.mockImplementation((url: string | RequestInfo, _init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : (url as Request).url;
      if (urlString.includes('/api/entries') && !urlString.includes('?') && _init?.method !== 'POST') {
        entriesCallCount++;
        if (entriesCallCount === 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ entries: [] });
      }
      return defaultFetchJsonMock(url);
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(result.current.entries).toEqual([]);
    }, { timeout: 3000 });

    await result.current.refreshEntries();

    await waitFor(() => {
      expect(result.current.entries).toEqual([]);
    }, { timeout: 1000 });

    expect(result.current).toBeDefined();
    expect(result.current.entries).toEqual([]);
  });
});


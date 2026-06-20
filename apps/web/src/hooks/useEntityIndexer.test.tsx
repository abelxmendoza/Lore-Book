import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { makeStore } from '../store';
import { resetEntityIndexerCache, useEntityIndexer } from './useEntityIndexer';
import { clearLexicalPreviewSharedCache } from '../lib/lexicalPreviewCache';
import { clearLoreBookParseSharedCache } from '../lib/loreBookParseCache';

const fetchJson = vi.fn();
const mockFetchLoreBookParseShared = vi.fn();
const mockFetchLexicalPreviewShared = vi.fn();

vi.mock('../lib/loreBookParseCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/loreBookParseCache')>();
  return {
    ...actual,
    fetchLoreBookParseShared: (...args: unknown[]) => mockFetchLoreBookParseShared(...args),
  };
});

vi.mock('../lib/lexicalPreviewCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/lexicalPreviewCache')>();
  return {
    ...actual,
    fetchLexicalPreviewShared: (...args: unknown[]) => mockFetchLexicalPreviewShared(...args),
  };
});

vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock('../lib/cache', () => ({
  apiCache: { delete: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: vi.fn(() => false),
  useShouldUseMockData: vi.fn(() => false),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={makeStore()}>{children}</Provider>;
}

const INDEX_ENTITIES = [
  {
    id: 'uuid-abel',
    name: 'Abel',
    type: 'character',
    aliases: [],
    mentionKeys: ['abel'],
    status: 'confirmed',
  },
];

function mockFetchRoutes(options?: { lorebookFails?: boolean; lexicalFails?: boolean }) {
  mockFetchLexicalPreviewShared.mockImplementation(async () => {
    if (options?.lexicalFails) throw new Error('lexical offline');
    return { spans: [], inferredAssociations: [], ambiguities: [] };
  });
  mockFetchLoreBookParseShared.mockImplementation(async () => {
    if (options?.lorebookFails) throw new Error('lorebook offline');
    return {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Oscar Martinez',
          confidence: 0.9,
          gate: 'suggest',
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };
  });
  fetchJson.mockImplementation((url: string) => {
    if (url.includes('/api/entities/certified-index')) {
      return Promise.resolve({ entities: INDEX_ENTITIES });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

describe('useEntityIndexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEntityIndexerCache();
    clearLexicalPreviewSharedCache();
    clearLoreBookParseSharedCache();
    mockFetchRoutes();
  });

  it('re-analyzes draft text after the certified index finishes loading', async () => {
    const { result } = renderHook(() => useEntityIndexer(), { wrapper });

    act(() => {
      result.current.analyze('Tell me about Abel');
    });

    expect(result.current.matches).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.matches.some((m) => m.name === 'Abel')).toBe(true);
  });

  it('merges LoreBook parse chips after debounced preview fetch', async () => {
    const { result } = renderHook(() => useEntityIndexer(), { wrapper });

    await waitFor(() => expect(result.current.indexReady).toBe(true));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => {
      result.current.analyze('Oscar Martinez joined the team');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    await waitFor(() => {
      expect(mockFetchLoreBookParseShared).toHaveBeenCalledWith(
        'Oscar Martinez joined the team',
        undefined
      );
    });
    vi.useRealTimers();
  });

  it('keeps index matches when LoreBook parse fails but lexical preview succeeds', async () => {
    clearLoreBookParseSharedCache();
    mockFetchRoutes({ lorebookFails: true });

    const { result } = renderHook(() => useEntityIndexer(), { wrapper });
    await waitFor(() => expect(result.current.indexReady).toBe(true));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => {
      result.current.analyze('Tell me about Abel');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(result.current.matches.some((m) => m.name === 'Abel')).toBe(true);
    expect(result.current.matches.some((m) => m.id.includes('draft:lorebook'))).toBe(false);
    vi.useRealTimers();
  });

  it('surfaces index load errors and clears matches', async () => {
    fetchJson.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useEntityIndexer(), { wrapper });

    await waitFor(() => {
      expect(result.current.indexError).toBeTruthy();
    });

    expect(result.current.indexReady).toBe(false);
    expect(result.current.matches).toHaveLength(0);
  });

  it('retries index load after failure', async () => {
    fetchJson.mockRejectedValueOnce(new Error('network'));
    fetchJson.mockImplementation((url: string) => {
      if (url.includes('/api/entities/certified-index')) {
        return Promise.resolve({ entities: INDEX_ENTITIES });
      }
      return Promise.resolve({ spans: [], inferredAssociations: [], ambiguities: [] });
    });

    const { result } = renderHook(() => useEntityIndexer(), { wrapper });

    await waitFor(() => expect(result.current.indexError).toBeTruthy());

    act(() => {
      result.current.retryLoad();
    });

    await waitFor(() => expect(result.current.indexReady).toBe(true));
    expect(result.current.indexError).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { makeStore } from '../store';
import { resetEntityIndexerCache, useEntityIndexer } from './useEntityIndexer';

const fetchJson = vi.fn();

vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock('../lib/cache', () => ({
  apiCache: { delete: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={makeStore()}>{children}</Provider>;
}

describe('useEntityIndexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEntityIndexerCache();
    fetchJson.mockResolvedValue({
      entities: [
        {
          id: 'uuid-abel',
          name: 'Abel',
          type: 'character',
          aliases: [],
          mentionKeys: ['abel'],
          status: 'confirmed',
        },
      ],
    });
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
    fetchJson.mockResolvedValueOnce({
      entities: [
        {
          id: 'uuid-abel',
          name: 'Abel',
          type: 'character',
          aliases: [],
          mentionKeys: ['abel'],
          status: 'confirmed',
        },
      ],
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

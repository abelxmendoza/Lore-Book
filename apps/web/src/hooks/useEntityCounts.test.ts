import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchJson = vi.fn();
vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

describe('useEntityCounts', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchJson.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares one in-flight request across concurrent mounts instead of firing one per component', async () => {
    const counts = {
      characters: 1,
      family: 2,
      romantic: 3,
      locations: 4,
      events: 5,
      organizations: 6,
      skills: 7,
      projects: 8,
      anchors: 9,
    };
    let resolveFetch: (v: typeof counts) => void = () => {};
    mockFetchJson.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const { useEntityCounts } = await import('./useEntityCounts');

    // Two components mounting around the same time (e.g. Sidebar + HomeScreen).
    const a = renderHook(() => useEntityCounts());
    const b = renderHook(() => useEntityCounts());

    expect(mockFetchJson).toHaveBeenCalledTimes(1);
    expect(mockFetchJson).toHaveBeenCalledWith('/api/counts', undefined, { cache: false });

    resolveFetch(counts);
    await waitFor(() => expect(a.result.current).toEqual(counts));
    await waitFor(() => expect(b.result.current).toEqual(counts));
  });

  it('refreshes the shared counts after story data changes', async () => {
    const first = {
      characters: 1, family: 1, romantic: 1, locations: 1, events: 1,
      organizations: 1, skills: 1, projects: 1, anchors: 1,
    };
    const updated = { ...first, characters: 2, family: 2 };
    mockFetchJson.mockResolvedValueOnce(first).mockResolvedValueOnce(updated);
    const { useEntityCounts } = await import('./useEntityCounts');
    const hook = renderHook(() => useEntityCounts('user-refresh'));
    await waitFor(() => expect(hook.result.current).toEqual(first));

    act(() => {
      window.dispatchEvent(new CustomEvent('lk:story-data-updated', {
        detail: { scopes: ['characters', 'family'] },
      }));
    });

    await waitFor(() => expect(hook.result.current).toEqual(updated));
    expect(mockFetchJson).toHaveBeenCalledTimes(2);
  });

  it('does not reuse one account cache entry for another account', async () => {
    const first = {
      characters: 1, family: 1, romantic: 1, locations: 1, events: 1,
      organizations: 1, skills: 1, projects: 1, anchors: 1,
    };
    const second = { ...first, characters: 22 };
    mockFetchJson.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { useEntityCounts } = await import('./useEntityCounts');
    const hook = renderHook(({ userId }) => useEntityCounts(userId), {
      initialProps: { userId: 'user-a' },
    });
    await waitFor(() => expect(hook.result.current).toEqual(first));

    hook.rerender({ userId: 'user-b' });

    await waitFor(() => expect(hook.result.current).toEqual(second));
    expect(mockFetchJson).toHaveBeenCalledTimes(2);
  });
});

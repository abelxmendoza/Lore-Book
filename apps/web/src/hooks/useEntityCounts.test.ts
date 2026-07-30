import { renderHook, waitFor } from '@testing-library/react';
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
    const counts = { characters: 1, locations: 2, events: 3, organizations: 4, skills: 5, projects: 6 };
    let resolveFetch: (v: typeof counts) => void = () => {};
    mockFetchJson.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const { useEntityCounts } = await import('./useEntityCounts');

    // Two components mounting around the same time (e.g. Sidebar + HomeScreen).
    const a = renderHook(() => useEntityCounts());
    const b = renderHook(() => useEntityCounts());

    expect(mockFetchJson).toHaveBeenCalledTimes(1);

    resolveFetch(counts);
    await waitFor(() => expect(a.result.current).toEqual(counts));
    await waitFor(() => expect(b.result.current).toEqual(counts));
  });
});

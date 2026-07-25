import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRuntime = vi.hoisted(() => ({ enabled: false }));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: mockRuntime.enabled }),
}));

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestState: null }),
}));

import { fetchJson } from '../../lib/api';
import { makeStore } from '../index';

import { useBookEntityIndexSearch } from './useEntityBooks';

const mockedFetchJson = vi.mocked(fetchJson);

describe('useBookEntityIndexSearch', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
    mockRuntime.enabled = false;
  });

  it('debounces authenticated searches and hides stale results while the query changes', async () => {
    mockedFetchJson.mockImplementation(async (url) => {
      const query = new URL(String(url), 'http://localhost').searchParams.get('q');
      return {
        entities: query === 'vanguard'
          ? [{
              id: 'org-1',
              name: 'Vanguard Robotics',
              type: 'organization',
              status: 'active',
              aliases: [],
              updatedAt: null,
            }]
          : [],
        counts: { organization: query === 'vanguard' ? 1 : 0 },
        total: query === 'vanguard' ? 1 : 0,
        limit: 100,
        offset: 0,
      };
    });
    const store = makeStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result, rerender } = renderHook(
      ({ search }) => useBookEntityIndexSearch(['organization'], search),
      { wrapper, initialProps: { search: 'vanguard' } },
    );

    await waitFor(() => expect(result.current.entities).toHaveLength(1));
    rerender({ search: 'another group' });

    expect(result.current.entities).toEqual([]);
    expect(result.current.isSearching).toBe(true);
  });

  it('searches supplied Demo Mode entities locally without a network request', async () => {
    mockRuntime.enabled = true;
    const store = makeStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useBookEntityIndexSearch(
        ['organization'],
        'thursday gang',
        {
          mockEntities: [{
            id: 'mock-1',
            name: 'The Thursday Crew',
            type: 'organization',
            status: 'active',
            aliases: ['Thursday people', 'Thursday gang'],
            updatedAt: null,
          }],
        },
      ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.entities).toHaveLength(1));
    expect(result.current.source).toBe('demo');
    expect(result.current.total).toBe(1);
    expect(mockedFetchJson).not.toHaveBeenCalled();
  });
});

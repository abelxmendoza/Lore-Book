import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';
import { makeStore } from '../index';

import { entitiesApi } from './entitiesApi';
import { questsApi } from './questsApi';

const mockedFetchJson = vi.mocked(fetchJson);

const emptyIndex = {
  entities: [],
  counts: {},
  total: 0,
  limit: 20,
  offset: 0,
};

describe('shared Book entity index client', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
  });

  it('normalizes equivalent type lists into one cache entry and canonical URL', async () => {
    mockedFetchJson.mockResolvedValue(emptyIndex);
    const store = makeStore();

    const first = store.dispatch(entitiesApi.endpoints.getBookEntityIndex.initiate({
      types: ['quest', 'organization', 'quest'],
      q: '  vanguard  ',
      limit: 20,
      offset: 0,
    }));
    await first.unwrap();
    const second = store.dispatch(entitiesApi.endpoints.getBookEntityIndex.initiate({
      types: ['organization', 'quest'],
      q: 'vanguard',
      limit: 20,
      offset: 0,
    }));
    await second.unwrap();

    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/entities/book-index?types=organization%2Cquest&q=vanguard&limit=20&offset=0',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Object),
    );

    first.unsubscribe();
    second.unsubscribe();
  });

  it('refetches a subscribed quest index after a quest mutation', async () => {
    mockedFetchJson.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/entities/book-index')) return emptyIndex;
      if (url === '/api/quests') return { quest: { id: 'quest-1', title: 'Ship retrieval' } };
      return {};
    });
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getBookEntityIndex.initiate({
      types: ['quest'],
      q: 'ship',
      limit: 20,
    }));
    await subscription.unwrap();

    await store.dispatch(questsApi.endpoints.createQuest.initiate({
      title: 'Ship retrieval',
      quest_type: 'main',
    })).unwrap();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const indexCalls = mockedFetchJson.mock.calls.filter(
        ([url]) => String(url).startsWith('/api/entities/book-index'),
      );
      if (indexCalls.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(mockedFetchJson.mock.calls.filter(
      ([url]) => String(url).startsWith('/api/entities/book-index'),
    )).toHaveLength(2);
    subscription.unsubscribe();
  });
});

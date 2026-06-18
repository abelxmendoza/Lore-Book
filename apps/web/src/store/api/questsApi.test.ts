import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';

import { makeStore } from '../index';
import { questsApi } from './questsApi';

const mockedFetchJson = vi.mocked(fetchJson);

describe('questsApi', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
  });

  it('getQuestBoard fetches /api/quests/board', async () => {
    mockedFetchJson.mockResolvedValueOnce({
      todays_quests: [],
      this_weeks_quests: [],
      main_quests: [],
      side_quests: [],
      completed_quests: [],
      total_count: 0,
    });

    const store = makeStore();
    const result = await store.dispatch(questsApi.endpoints.getQuestBoard.initiate());

    expect(result.data?.total_count).toBe(0);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/quests/board',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Object)
    );
  });

  it('createQuest invalidates board cache', async () => {
    mockedFetchJson
      .mockResolvedValueOnce({
        todays_quests: [],
        this_weeks_quests: [],
        main_quests: [],
        side_quests: [],
        completed_quests: [],
        total_count: 0,
      })
      .mockResolvedValueOnce({ quest: { id: 'new-q', title: 'Test' } });

    const store = makeStore();
    await store.dispatch(questsApi.endpoints.getQuestBoard.initiate());
    expect(mockedFetchJson).toHaveBeenCalledTimes(1);

    await store.dispatch(
      questsApi.endpoints.createQuest.initiate({ title: 'Test', quest_type: 'main' })
    );

    await store.dispatch(questsApi.endpoints.getQuestBoard.initiate());
    expect(mockedFetchJson).toHaveBeenCalledTimes(3);
  });

  it('convertGoalToQuest POSTs to the convert endpoint', async () => {
    mockedFetchJson.mockResolvedValueOnce({ quest: { id: 'q1', title: 'From goal' } });

    const store = makeStore();
    await store.dispatch(questsApi.endpoints.convertGoalToQuest.initiate('goal-1'));

    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/quests/convert/goal/goal-1',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Object)
    );
  });
});

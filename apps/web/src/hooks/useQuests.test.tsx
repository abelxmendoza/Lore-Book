import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';

vi.mock('../contexts/MockDataContext', () => ({
  useMockData: vi.fn(() => ({ useMockData: false })),
}));

vi.mock('./useShouldUseMockData', () => ({
  useShouldUseMockData: vi.fn(() => false),
}));

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { useMockData } from '../contexts/MockDataContext';
import { useShouldUseMockData } from './useShouldUseMockData';
import { fetchJson } from '../lib/api';
import { makeStore } from '../store';
import { useQuestBoard } from './useQuests';

const mockUseMockData = vi.mocked(useMockData);
const mockShouldUseMock = vi.mocked(useShouldUseMockData);
const mockFetchJson = vi.mocked(fetchJson);

describe('useQuestBoard (RTK)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMockData.mockReturnValue({ useMockData: false } as never);
    mockShouldUseMock.mockReturnValue(false);
  });

  it('loads the quest board through entitiesApi', async () => {
    mockFetchJson.mockResolvedValueOnce({
      todays_quests: [],
      this_weeks_quests: [],
      main_quests: [{ id: 'q1', title: 'Main quest' }],
      side_quests: [],
      daily_quests: [],
      completed_quests: [],
      total_count: 1,
    });

    const store = makeStore();
    const { result } = renderHook(() => useQuestBoard(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.main_quests).toHaveLength(1);
    expect(mockFetchJson).toHaveBeenCalledWith(
      '/api/quests/board',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Object)
    );
  });
});

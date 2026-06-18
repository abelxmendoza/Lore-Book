import { useMemo } from 'react';

import { useMockData } from '../../contexts/MockDataContext';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import type { QuestBoard } from '../../types/quest';
import { isFetchJsonError } from '../api/baseApi';

/** True when quest hooks should serve mock/demo data instead of RTK server queries. */
export function useQuestMockRuntime() {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const useMock = shouldUseMock && isMockDataEnabled;
  return { useMock, isMockDataEnabled, shouldUseMock };
}

export function rtkQueryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (isFetchJsonError(error)) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return 'Request failed';
}

export const EMPTY_QUEST_BOARD: QuestBoard = {
  todays_quests: [],
  this_weeks_quests: [],
  main_quests: [],
  side_quests: [],
  daily_quests: [],
  completed_quests: [],
  total_count: 0,
};

/** Stable memo key for quest list filters (RTK query arg). */
export function useQuestFiltersArg<T>(filters: T | undefined): T | void {
  return useMemo(() => filters, [JSON.stringify(filters ?? {})]);
}

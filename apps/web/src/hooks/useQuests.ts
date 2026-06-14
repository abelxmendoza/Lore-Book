import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { apiCache } from '../lib/cache';
import { clampQuestScore, normalizeQuestType, optionalQuestString } from '../lib/questNormalize';
import { useMockData } from '../contexts/MockDataContext';
import { useShouldUseMockData } from './useShouldUseMockData';
import { mockDataService } from '../services/mockDataService';
import { MOCK_QUESTS, MOCK_QUEST_BOARD, MOCK_QUEST_ANALYTICS, MOCK_QUEST_SUGGESTIONS, buildQuestBoardFromQuests } from '../mocks/quests';
import type { Quest, QuestFilters, QuestBoard, QuestAnalytics, QuestHistory, QuestSuggestion } from '../types/quest';

const notifyQuestUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('lk:quests-updated'));
  }
};

/**
 * Hook to fetch quests with filters.
 * When user is logged in, never uses mock data — clean slate for all users.
 */
export function useQuests(filters?: QuestFilters) {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // When logged in, never use mock. When not logged in, use mock only if toggle on.
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.quests(MOCK_QUESTS);
        let filteredQuests = [...MOCK_QUESTS];

        // Apply filters
        if (filters?.status) {
          const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
          filteredQuests = filteredQuests.filter(q => statuses.includes(q.status));
        }
        if (filters?.quest_type) {
          const types = Array.isArray(filters.quest_type) ? filters.quest_type : [filters.quest_type];
          filteredQuests = filteredQuests.filter(q => types.includes(q.quest_type));
        }
        if (filters?.category) {
          filteredQuests = filteredQuests.filter(q => q.category === filters.category);
        }
        if (filters?.search) {
          const query = filters.search.toLowerCase();
          filteredQuests = filteredQuests.filter(
            q =>
              q.title.toLowerCase().includes(query) ||
              q.description?.toLowerCase().includes(query) ||
              q.tags?.some(tag => tag.toLowerCase().includes(query))
          );
        }
        if (filters?.min_priority) {
          filteredQuests = filteredQuests.filter(q => q.priority >= filters.min_priority!);
        }
        if (filters?.min_importance) {
          filteredQuests = filteredQuests.filter(q => q.importance >= filters.min_importance!);
        }
        if (filters?.min_impact) {
          filteredQuests = filteredQuests.filter(q => q.impact >= filters.min_impact!);
        }

        setQuests(filteredQuests);
        return;
      }

      const params = new URLSearchParams();
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          filters.status.forEach(s => params.append('status', s));
        } else {
          params.append('status', filters.status);
        }
      }
      if (filters?.quest_type) {
        if (Array.isArray(filters.quest_type)) {
          filters.quest_type.forEach(t => params.append('quest_type', t));
        } else {
          params.append('quest_type', filters.quest_type);
        }
      }
      if (filters?.category) params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.min_priority) params.append('min_priority', filters.min_priority.toString());
      if (filters?.min_importance) params.append('min_importance', filters.min_importance.toString());
      if (filters?.min_impact) params.append('min_impact', filters.min_impact.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const result = await fetchJson<{ quests: Quest[] }>(`/api/quests?${params.toString()}`);
      setQuests(result.quests || []);
    } catch (err) {
      console.error('Failed to fetch quests:', err);
      // When logged in, never fallback to mock — show error and empty. When not logged in, fallback only if toggle on.
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.quests(MOCK_QUESTS);
        setQuests(MOCK_QUESTS);
      } else {
        setQuests([]);
        setError('Failed to fetch quests');
      }
    } finally {
      setLoading(false);
    }
  }, [filters, isMockDataEnabled, shouldUseMock]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  return { data: quests, isLoading: loading, error, refetch: fetchQuests };
}

/**
 * Hook to fetch a single quest.
 * When user is logged in, never uses mock data.
 */
export function useQuest(questId: string) {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuest = useCallback(async () => {
    if (!questId) return;
    setLoading(true);
    setError(null);
    try {
      if (shouldUseMock && isMockDataEnabled) {
        // Find quest in mock data
        const mockQuest = MOCK_QUESTS.find(q => q.id === questId);
        if (mockQuest) {
          setQuest(mockQuest);
          setLoading(false);
          return;
        } else {
          setError('Quest not found');
          setLoading(false);
          return;
        }
      }

      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}`);
      setQuest(result.quest);
    } catch (err) {
      console.error('Failed to fetch quest:', err);
      if (shouldUseMock && isMockDataEnabled) {
        const mockQuest = MOCK_QUESTS.find(q => q.id === questId);
        if (mockQuest) setQuest(mockQuest);
        else setError('Quest not found');
      } else {
        setQuest(null);
        setError('Failed to fetch quest');
      }
    } finally {
      setLoading(false);
    }
  }, [questId, isMockDataEnabled, shouldUseMock]);

  useEffect(() => {
    fetchQuest();
  }, [fetchQuest]);

  return { data: quest, isLoading: loading, error, refetch: fetchQuest };
}

/**
 * Hook to fetch quest board.
 * When user is logged in, always fetches real data (empty board for new users).
 */
export function useQuestBoard() {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [board, setBoard] = useState<QuestBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (shouldUseMock && isMockDataEnabled) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const registered = mockDataService.get.quests();
        const quests = registered.length > 0 ? registered : MOCK_QUESTS;
        const board = registered.length > 0 ? buildQuestBoardFromQuests(quests) : MOCK_QUEST_BOARD;
        mockDataService.register.questBoard(board);
        setBoard(board);
        setLoading(false);
        return;
      }

      apiCache.deletePattern(/\/api\/quests(\/|\?|:)/);
      const result = await fetchJson<QuestBoard>('/api/quests/board');
      const emptyBoard: QuestBoard = {
        todays_quests: [],
        this_weeks_quests: [],
        main_quests: [],
        side_quests: [],
        daily_quests: [],
        completed_quests: [],
        total_count: 0,
      };
      setBoard(result ?? emptyBoard);
    } catch (err) {
      console.error('Failed to fetch quest board:', err);
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.questBoard(MOCK_QUEST_BOARD);
        setBoard(MOCK_QUEST_BOARD);
      } else {
        setBoard({
          todays_quests: [],
          this_weeks_quests: [],
          main_quests: [],
          side_quests: [],
          daily_quests: [],
          completed_quests: [],
          total_count: 0,
        });
        setError('Failed to load quest board');
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled, shouldUseMock]);

  useEffect(() => {
    fetchBoard();
    // Refresh when a quest is created/changed anywhere (e.g. accepting a
    // detected suggestion) so the board stays in sync without a manual reload.
    const onUpdated = () => { void fetchBoard(); };
    window.addEventListener('lk:quests-updated', onUpdated);
    return () => window.removeEventListener('lk:quests-updated', onUpdated);
  }, [fetchBoard]);

  return { data: board, isLoading: loading, error, refetch: fetchBoard };
}

/**
 * Hook to fetch quest analytics.
 * When user is logged in, never uses mock data.
 */
export function useQuestAnalytics() {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [analytics, setAnalytics] = useState<QuestAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.questAnalytics(MOCK_QUEST_ANALYTICS);
        setAnalytics(MOCK_QUEST_ANALYTICS);
        return;
      }

      const result = await fetchJson<QuestAnalytics>('/api/quests/analytics');
      setAnalytics(result);
    } catch (err) {
      console.error('Failed to fetch quest analytics:', err);
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.questAnalytics(MOCK_QUEST_ANALYTICS);
        setAnalytics(MOCK_QUEST_ANALYTICS);
      } else {
        setAnalytics(null);
        setError('Failed to fetch quest analytics');
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled, shouldUseMock]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { data: analytics, isLoading: loading, error, refetch: fetchAnalytics };
}

/**
 * Hook to fetch quest history.
 * When user is logged in, never uses mock data.
 */
export function useQuestHistory(questId: string) {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [history, setHistory] = useState<QuestHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!questId) return;
    setLoading(true);
    setError(null);
    try {
      if (shouldUseMock && isMockDataEnabled) {
        setHistory([]);
        setLoading(false);
        return;
      }

      const result = await fetchJson<{ history: QuestHistory[] }>(`/api/quests/${questId}/history`);
      setHistory(result.history || []);
    } catch (err) {
      console.error('Failed to fetch quest history:', err);
      setHistory([]);
      if (!shouldUseMock || !isMockDataEnabled) {
        setError('Failed to fetch quest history');
      }
    } finally {
      setLoading(false);
    }
  }, [questId, isMockDataEnabled, shouldUseMock]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { data: history, isLoading: loading, error, refetch: fetchHistory };
}

/**
 * Hook to fetch quest suggestions.
 * When user is logged in, never uses mock data.
 */
export function useQuestSuggestions() {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [suggestions, setSuggestions] = useState<QuestSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.questSuggestions(MOCK_QUEST_SUGGESTIONS);
        setSuggestions(MOCK_QUEST_SUGGESTIONS);
        return;
      }

      const result = await fetchJson<{ suggestions: QuestSuggestion[] }>('/api/quests/suggestions');
      setSuggestions(result.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch quest suggestions:', err);
      if (shouldUseMock && isMockDataEnabled) {
        mockDataService.register.questSuggestions(MOCK_QUEST_SUGGESTIONS);
        setSuggestions(MOCK_QUEST_SUGGESTIONS);
      } else {
        setSuggestions([]);
        setError('Failed to fetch quest suggestions');
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled, shouldUseMock]);

  useEffect(() => {
    fetchSuggestions();
    // Re-read conversations periodically so new hopes/dreams/plans surface as
    // suggestions without the user having to refresh.
    const interval = setInterval(() => { void fetchSuggestions(); }, 5 * 60 * 1000);
    const onRefresh = () => { void fetchSuggestions(); };
    window.addEventListener('lk:quests-updated', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('lk:quests-updated', onRefresh);
    };
  }, [fetchSuggestions]);

  return { data: suggestions, isLoading: loading, error, refetch: fetchSuggestions };
}

/**
 * Hook to create a quest
 */
export function useCreateQuest() {
  const { useMockData: isMockDataEnabled } = useMockData();
  const shouldUseMock = useShouldUseMockData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questData: {
    title: string;
    description?: string;
    quest_type?: string;
    priority?: number;
    importance?: number;
    impact?: number;
    source?: Quest['source'];
    category?: string;
  }) => {
    setLoading(true);
    setError(null);

    const payload = {
      title: questData.title.trim(),
      description: optionalQuestString(questData.description),
      quest_type: normalizeQuestType(questData.quest_type),
      priority: clampQuestScore(questData.priority),
      importance: clampQuestScore(questData.importance),
      impact: clampQuestScore(questData.impact),
      source: questData.source ?? 'manual',
      category: optionalQuestString(questData.category),
    };

    try {
      if (shouldUseMock && isMockDataEnabled) {
        const now = new Date().toISOString();
        const newQuest: Quest = {
          id: `quest-mock-${Date.now()}`,
          title: payload.title,
          description: payload.description,
          quest_type: payload.quest_type,
          priority: payload.priority,
          importance: payload.importance,
          impact: payload.impact,
          status: 'active',
          progress_percentage: 0,
          source: payload.source as Quest['source'],
          category: payload.category,
          created_at: now,
          updated_at: now,
          last_activity_at: now,
        };
        const existing = mockDataService.get.quests();
        const quests = existing.length > 0 ? [...existing, newQuest] : [...MOCK_QUESTS, newQuest];
        mockDataService.register.quests(quests);
        mockDataService.register.questBoard(buildQuestBoardFromQuests(quests));
        notifyQuestUpdated();
        return newQuest;
      }

      const result = await fetchJson<{ quest: Quest }>('/api/quests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!result?.quest?.id) {
        throw new Error('Server did not return the new quest');
      }
      apiCache.deletePattern(/\/api\/quests(\/|\?|:)/);
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to create quest:', err);
      setError(err instanceof Error ? err.message : 'Failed to create quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled, shouldUseMock]);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to update a quest
 */
export function useUpdateQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, updates }: { questId: string; updates: any }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to update quest:', err);
      setError('Failed to update quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to delete a quest
 */
export function useDeleteQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questId: string) => {
    setLoading(true);
    setError(null);
    try {
      await fetchJson(`/api/quests/${questId}`, {
        method: 'DELETE',
      });
      notifyQuestUpdated();
    } catch (err) {
      console.error('Failed to delete quest:', err);
      setError('Failed to delete quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to start a quest
 */
export function useStartQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/start`, {
        method: 'POST',
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to start quest:', err);
      setError('Failed to start quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to complete a quest
 */
export function useCompleteQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, notes }: { questId: string; notes?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to complete quest:', err);
      setError('Failed to complete quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to abandon a quest
 */
export function useAbandonQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, reason }: { questId: string; reason?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/abandon`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to abandon quest:', err);
      setError('Failed to abandon quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to pause a quest
 */
export function usePauseQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/pause`, {
        method: 'POST',
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to pause quest:', err);
      setError('Failed to pause quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to update quest progress
 */
export function useUpdateQuestProgress() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, progress }: { questId: string; progress: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/progress`, {
        method: 'POST',
        body: JSON.stringify({ progress }),
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to update quest progress:', err);
      setError('Failed to update quest progress');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to add reflection
 */
export function useAddQuestReflection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, reflection }: { questId: string; reflection: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ history: QuestHistory }>(`/api/quests/${questId}/reflect`, {
        method: 'POST',
        body: JSON.stringify({ reflection }),
      });
      notifyQuestUpdated();
      return result.history;
    } catch (err) {
      console.error('Failed to add reflection:', err);
      setError('Failed to add reflection');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to add a quest dependency
 */
export function useAddQuestDependency() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, dependsOnQuestId }: { questId: string; dependsOnQuestId: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ dependency: any }>(`/api/quests/${questId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ depends_on_quest_id: dependsOnQuestId }),
      });
      notifyQuestUpdated();
      return result.dependency;
    } catch (err) {
      console.error('Failed to add quest dependency:', err);
      setError('Failed to add quest dependency');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to link a quest to a goal
 */
export function useLinkQuestToGoal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, goalId }: { questId: string; goalId: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean }>(`/api/quests/${questId}/link-goal`, {
        method: 'POST',
        body: JSON.stringify({ goal_id: goalId }),
      });
      notifyQuestUpdated();
      return result.success;
    } catch (err) {
      console.error('Failed to link quest to goal:', err);
      setError('Failed to link quest to goal');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to link a quest to a task
 */
export function useLinkQuestToTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, taskId }: { questId: string; taskId: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean }>(`/api/quests/${questId}/link-task`, {
        method: 'POST',
        body: JSON.stringify({ task_id: taskId }),
      });
      notifyQuestUpdated();
      return result.success;
    } catch (err) {
      console.error('Failed to link quest to task:', err);
      setError('Failed to link quest to task');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to convert a goal to a quest
 */
export function useConvertGoalToQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (goalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/convert/goal/${goalId}`, {
        method: 'POST',
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to convert goal to quest:', err);
      setError('Failed to convert goal to quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

/**
 * Hook to convert a task to a quest
 */
export function useConvertTaskToQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (taskId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/convert/task/${taskId}`, {
        method: 'POST',
      });
      notifyQuestUpdated();
      return result.quest;
    } catch (err) {
      console.error('Failed to convert task to quest:', err);
      setError('Failed to convert task to quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutateAsync, isPending: loading, error };
}

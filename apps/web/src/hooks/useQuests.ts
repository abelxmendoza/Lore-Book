import { useState, useCallback, useEffect } from 'react';
import { clampQuestScore, normalizeQuestType, optionalQuestString } from '../lib/questNormalize';
import { mockDataService } from '../services/mockDataService';
import { MOCK_QUESTS, MOCK_QUEST_BOARD, MOCK_QUEST_ANALYTICS, MOCK_QUEST_SUGGESTIONS, buildQuestBoardFromQuests } from '../mocks/quests';
import type { Quest, QuestFilters, QuestBoard, QuestAnalytics, QuestHistory, QuestSuggestion } from '../types/quest';
import {
  useGetQuestsListQuery,
  useGetQuestByIdQuery,
  useGetQuestBoardQuery,
  useGetQuestAnalyticsQuery,
  useGetQuestHistoryQuery,
  useGetQuestSuggestionsQuery,
  useCreateQuestMutation,
  useUpdateQuestMutation,
  useDeleteQuestMutation,
  useStartQuestMutation,
  useCompleteQuestMutation,
  useAbandonQuestMutation,
  usePauseQuestMutation,
  useUpdateQuestProgressMutation,
  useAddQuestReflectionMutation,
  useAddQuestDependencyMutation,
  useLinkQuestToGoalMutation,
  useLinkQuestToTaskMutation,
  useConvertGoalToQuestMutation,
  useConvertTaskToQuestMutation,
} from '../store/api/questsApi';
import {
  useQuestMockRuntime,
  useQuestFiltersArg,
  rtkQueryErrorMessage,
  EMPTY_QUEST_BOARD,
} from '../store/hooks/useQuestData';
import { mutationErrorMessage } from '../store/rtkMutationUtils';

function applyMockQuestFilters(quests: Quest[], filters?: QuestFilters): Quest[] {
  let filteredQuests = [...quests];
  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    filteredQuests = filteredQuests.filter((q) => statuses.includes(q.status));
  }
  if (filters?.quest_type) {
    const types = Array.isArray(filters.quest_type) ? filters.quest_type : [filters.quest_type];
    filteredQuests = filteredQuests.filter((q) => types.includes(q.quest_type));
  }
  if (filters?.category) {
    filteredQuests = filteredQuests.filter((q) => q.category === filters.category);
  }
  if (filters?.search) {
    const query = filters.search.toLowerCase();
    filteredQuests = filteredQuests.filter(
      (q) =>
        q.title.toLowerCase().includes(query) ||
        q.description?.toLowerCase().includes(query) ||
        q.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }
  if (filters?.min_priority) {
    filteredQuests = filteredQuests.filter((q) => q.priority >= filters.min_priority!);
  }
  if (filters?.min_importance) {
    filteredQuests = filteredQuests.filter((q) => q.importance >= filters.min_importance!);
  }
  if (filters?.min_impact) {
    filteredQuests = filteredQuests.filter((q) => q.impact >= filters.min_impact!);
  }
  return filteredQuests;
}

/**
 * Hook to fetch quests with filters.
 * When user is logged in, never uses mock data — clean slate for all users.
 */
export function useQuests(filters?: QuestFilters) {
  const { useMock } = useQuestMockRuntime();
  const filtersArg = useQuestFiltersArg(filters);
  const query = useGetQuestsListQuery(filtersArg, { skip: useMock });
  const [mockQuests, setMockQuests] = useState<Quest[]>([]);
  const [mockLoading, setMockLoading] = useState(useMock);
  const [mockError, setMockError] = useState<string | null>(null);

  const loadMockQuests = useCallback(async () => {
    setMockLoading(true);
    setMockError(null);
    try {
      mockDataService.register.quests(MOCK_QUESTS);
      setMockQuests(applyMockQuestFilters(MOCK_QUESTS, filters));
    } catch {
      setMockQuests([]);
      setMockError('Failed to fetch quests');
    } finally {
      setMockLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (useMock) void loadMockQuests();
  }, [useMock, loadMockQuests]);

  if (useMock) {
    return { data: mockQuests, isLoading: mockLoading, error: mockError, refetch: loadMockQuests };
  }

  return {
    data: query.data?.quests ?? [],
    isLoading: query.isLoading || query.isFetching,
    error: rtkQueryErrorMessage(query.error) ?? (query.isError ? 'Failed to fetch quests' : null),
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to fetch a single quest.
 * When user is logged in, never uses mock data.
 */
export function useQuest(questId: string) {
  const { useMock } = useQuestMockRuntime();
  const query = useGetQuestByIdQuery(questId, { skip: useMock || !questId });
  const [mockQuest, setMockQuest] = useState<Quest | null>(null);
  const [mockLoading, setMockLoading] = useState(useMock && !!questId);
  const [mockError, setMockError] = useState<string | null>(null);

  const loadMockQuest = useCallback(async () => {
    if (!questId) return;
    setMockLoading(true);
    setMockError(null);
    const found = MOCK_QUESTS.find((q) => q.id === questId);
    if (found) setMockQuest(found);
    else setMockError('Quest not found');
    setMockLoading(false);
  }, [questId]);

  useEffect(() => {
    if (useMock) void loadMockQuest();
  }, [useMock, loadMockQuest]);

  if (useMock) {
    return { data: mockQuest, isLoading: mockLoading, error: mockError, refetch: loadMockQuest };
  }

  return {
    data: query.data?.quest ?? null,
    isLoading: query.isLoading || query.isFetching,
    error: rtkQueryErrorMessage(query.error) ?? (query.isError ? 'Failed to fetch quest' : null),
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to fetch quest board.
 * When user is logged in, always fetches real data (empty board for new users).
 */
export function useQuestBoard() {
  const { useMock } = useQuestMockRuntime();
  const query = useGetQuestBoardQuery(undefined, { skip: useMock });
  const [mockBoard, setMockBoard] = useState<QuestBoard | null>(null);
  const [mockLoading, setMockLoading] = useState(useMock);
  const [mockError, setMockError] = useState<string | null>(null);

  const loadMockBoard = useCallback(async () => {
    setMockLoading(true);
    setMockError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const registered = mockDataService.get.quests();
      const quests = registered.length > 0 ? registered : MOCK_QUESTS;
      const board = registered.length > 0 ? buildQuestBoardFromQuests(quests) : MOCK_QUEST_BOARD;
      mockDataService.register.questBoard(board);
      setMockBoard(board);
    } catch {
      mockDataService.register.questBoard(MOCK_QUEST_BOARD);
      setMockBoard(MOCK_QUEST_BOARD);
      setMockError('Failed to load quest board');
    } finally {
      setMockLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useMock) void loadMockBoard();
  }, [useMock, loadMockBoard]);

  if (useMock) {
    return { data: mockBoard, isLoading: mockLoading, error: mockError, refetch: loadMockBoard };
  }

  return {
    data: query.data ?? EMPTY_QUEST_BOARD,
    isLoading: query.isLoading || query.isFetching,
    error: rtkQueryErrorMessage(query.error) ?? (query.isError ? 'Failed to load quest board' : null),
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to fetch quest analytics.
 * When user is logged in, never uses mock data.
 */
export function useQuestAnalytics() {
  const { useMock } = useQuestMockRuntime();
  const query = useGetQuestAnalyticsQuery(undefined, { skip: useMock });
  const [mockAnalytics, setMockAnalytics] = useState<QuestAnalytics | null>(null);
  const [mockLoading, setMockLoading] = useState(useMock);
  const [mockError, setMockError] = useState<string | null>(null);

  const loadMockAnalytics = useCallback(async () => {
    setMockLoading(true);
    setMockError(null);
    mockDataService.register.questAnalytics(MOCK_QUEST_ANALYTICS);
    setMockAnalytics(MOCK_QUEST_ANALYTICS);
    setMockLoading(false);
  }, []);

  useEffect(() => {
    if (useMock) void loadMockAnalytics();
  }, [useMock, loadMockAnalytics]);

  if (useMock) {
    return { data: mockAnalytics, isLoading: mockLoading, error: mockError, refetch: loadMockAnalytics };
  }

  return {
    data: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    error: rtkQueryErrorMessage(query.error) ?? (query.isError ? 'Failed to fetch quest analytics' : null),
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to fetch quest history.
 * When user is logged in, never uses mock data.
 */
export function useQuestHistory(questId: string) {
  const { useMock } = useQuestMockRuntime();
  const query = useGetQuestHistoryQuery(questId, { skip: useMock || !questId });

  if (useMock) {
    return { data: [] as QuestHistory[], isLoading: false, error: null, refetch: async () => {} };
  }

  return {
    data: query.data?.history ?? [],
    isLoading: query.isLoading || query.isFetching,
    error: rtkQueryErrorMessage(query.error) ?? (query.isError ? 'Failed to fetch quest history' : null),
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to fetch quest suggestions.
 * When user is logged in, never uses mock data.
 */
export function useQuestSuggestions() {
  const { useMock } = useQuestMockRuntime();
  const query = useGetQuestSuggestionsQuery(undefined, { skip: useMock });
  const [mockSuggestions, setMockSuggestions] = useState<QuestSuggestion[]>([]);
  const [mockLoading, setMockLoading] = useState(useMock);
  const [mockError, setMockError] = useState<string | null>(null);

  const loadMockSuggestions = useCallback(async () => {
    setMockLoading(true);
    setMockError(null);
    mockDataService.register.questSuggestions(MOCK_QUEST_SUGGESTIONS);
    setMockSuggestions(MOCK_QUEST_SUGGESTIONS);
    setMockLoading(false);
  }, []);

  useEffect(() => {
    if (!useMock) return;
    void loadMockSuggestions();
    const interval = setInterval(() => { void loadMockSuggestions(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [useMock, loadMockSuggestions]);

  useEffect(() => {
    if (useMock) return;
    const interval = setInterval(() => { void query.refetch(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [useMock, query]);

  if (useMock) {
    return { data: mockSuggestions, isLoading: mockLoading, error: mockError, refetch: loadMockSuggestions };
  }

  return {
    data: query.data?.suggestions ?? [],
    isLoading: query.isLoading || query.isFetching,
    error: rtkQueryErrorMessage(query.error) ?? (query.isError ? 'Failed to fetch quest suggestions' : null),
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to create a quest
 */
export function useCreateQuest() {
  const { useMock } = useQuestMockRuntime();
  const [createQuest, createState] = useCreateQuestMutation();
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
      if (useMock) {
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
        return newQuest;
      }

      const result = await createQuest(payload).unwrap();
      if (!result?.quest?.id) {
        throw new Error('Server did not return the new quest');
      }
      return result.quest;
    } catch (err) {
      const errMsg = mutationErrorMessage(err);
      console.error('Failed to create quest:', err);
      setError(errMsg);
      throw err;
    }
  }, [useMock, createQuest]);

  return { mutateAsync, isPending: createState.isLoading, error };
}

/**
 * Hook to update a quest
 */
export function useUpdateQuest() {
  const [updateQuest, updateState] = useUpdateQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, updates }: { questId: string; updates: Record<string, unknown> }) => {
    setError(null);
    try {
      const result = await updateQuest({ questId, updates }).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to update quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [updateQuest]);

  return { mutateAsync, isPending: updateState.isLoading, error };
}

export function useDeleteQuest() {
  const [deleteQuestMutation, deleteState] = useDeleteQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questId: string) => {
    setError(null);
    try {
      await deleteQuestMutation(questId).unwrap();
    } catch (err) {
      console.error('Failed to delete quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [deleteQuestMutation]);

  return { mutateAsync, isPending: deleteState.isLoading, error };
}

export function useStartQuest() {
  const [startQuest, startState] = useStartQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questId: string) => {
    setError(null);
    try {
      const result = await startQuest(questId).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to start quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [startQuest]);

  return { mutateAsync, isPending: startState.isLoading, error };
}

export function useCompleteQuest() {
  const [completeQuest, completeState] = useCompleteQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, notes }: { questId: string; notes?: string }) => {
    setError(null);
    try {
      const result = await completeQuest({ questId, notes }).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to complete quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [completeQuest]);

  return { mutateAsync, isPending: completeState.isLoading, error };
}

export function useAbandonQuest() {
  const [abandonQuest, abandonState] = useAbandonQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, reason }: { questId: string; reason?: string }) => {
    setError(null);
    try {
      const result = await abandonQuest({ questId, reason }).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to abandon quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [abandonQuest]);

  return { mutateAsync, isPending: abandonState.isLoading, error };
}

export function usePauseQuest() {
  const [pauseQuest, pauseState] = usePauseQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questId: string) => {
    setError(null);
    try {
      const result = await pauseQuest(questId).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to pause quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [pauseQuest]);

  return { mutateAsync, isPending: pauseState.isLoading, error };
}

export function useUpdateQuestProgress() {
  const [updateProgress, progressState] = useUpdateQuestProgressMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, progress }: { questId: string; progress: number }) => {
    setError(null);
    try {
      const result = await updateProgress({ questId, progress }).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to update quest progress:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [updateProgress]);

  return { mutateAsync, isPending: progressState.isLoading, error };
}

export function useAddQuestReflection() {
  const [addReflection, reflectionState] = useAddQuestReflectionMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, reflection }: { questId: string; reflection: string }) => {
    setError(null);
    try {
      const result = await addReflection({ questId, reflection }).unwrap();
      return result.history;
    } catch (err) {
      console.error('Failed to add reflection:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [addReflection]);

  return { mutateAsync, isPending: reflectionState.isLoading, error };
}

export function useAddQuestDependency() {
  const [addDependency, dependencyState] = useAddQuestDependencyMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(
    async ({ questId, dependsOnQuestId }: { questId: string; dependsOnQuestId: string }) => {
      setError(null);
      try {
        const result = await addDependency({ questId, dependsOnQuestId }).unwrap();
        return result.dependency;
      } catch (err) {
        console.error('Failed to add quest dependency:', err);
        setError(mutationErrorMessage(err));
        throw err;
      }
    },
    [addDependency]
  );

  return { mutateAsync, isPending: dependencyState.isLoading, error };
}

export function useLinkQuestToGoal() {
  const [linkGoal, linkState] = useLinkQuestToGoalMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, goalId }: { questId: string; goalId: string }) => {
    setError(null);
    try {
      const result = await linkGoal({ questId, goalId }).unwrap();
      return result.success;
    } catch (err) {
      console.error('Failed to link quest to goal:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [linkGoal]);

  return { mutateAsync, isPending: linkState.isLoading, error };
}

export function useLinkQuestToTask() {
  const [linkTask, linkState] = useLinkQuestToTaskMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async ({ questId, taskId }: { questId: string; taskId: string }) => {
    setError(null);
    try {
      const result = await linkTask({ questId, taskId }).unwrap();
      return result.success;
    } catch (err) {
      console.error('Failed to link quest to task:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [linkTask]);

  return { mutateAsync, isPending: linkState.isLoading, error };
}

export function useConvertGoalToQuest() {
  const [convertGoal, convertState] = useConvertGoalToQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (goalId: string) => {
    setError(null);
    try {
      const result = await convertGoal(goalId).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to convert goal to quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [convertGoal]);

  return { mutateAsync, isPending: convertState.isLoading, error };
}

export function useConvertTaskToQuest() {
  const [convertTask, convertState] = useConvertTaskToQuestMutation();
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (taskId: string) => {
    setError(null);
    try {
      const result = await convertTask(taskId).unwrap();
      return result.quest;
    } catch (err) {
      console.error('Failed to convert task to quest:', err);
      setError(mutationErrorMessage(err));
      throw err;
    }
  }, [convertTask]);

  return { mutateAsync, isPending: convertState.isLoading, error };
}

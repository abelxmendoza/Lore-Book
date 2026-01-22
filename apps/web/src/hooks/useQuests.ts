import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { useMockData } from '../contexts/MockDataContext';
import { mockDataService } from '../services/mockDataService';
import { MOCK_QUESTS, MOCK_QUEST_BOARD, MOCK_QUEST_ANALYTICS, MOCK_QUEST_SUGGESTIONS } from '../mocks/quests';
import type { Quest, QuestFilters, QuestBoard, QuestAnalytics, QuestHistory, QuestSuggestion } from '../types/quest';

/**
 * Hook to fetch quests with filters
 */
export function useQuests(filters?: QuestFilters) {
  const { isMockDataEnabled } = useMockData();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use mock data if enabled
      if (isMockDataEnabled) {
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
      // Fallback to mock data on error if not already using it
      if (!isMockDataEnabled) {
        console.log('Falling back to mock quest data');
        mockDataService.register.quests(MOCK_QUESTS);
        setQuests(MOCK_QUESTS);
      } else {
        setError('Failed to fetch quests');
      }
    } finally {
      setLoading(false);
    }
  }, [filters, isMockDataEnabled]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  return { data: quests, isLoading: loading, error, refetch: fetchQuests };
}

/**
 * Hook to fetch a single quest
 */
export function useQuest(questId: string) {
  const { isMockDataEnabled } = useMockData();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuest = useCallback(async () => {
    if (!questId) return;
    setLoading(true);
    setError(null);
    try {
      // Use mock data if enabled
      if (isMockDataEnabled) {
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
      // Fallback to mock data on error if not already using it
      if (!isMockDataEnabled) {
        console.log('Falling back to mock quest data');
        const mockQuest = MOCK_QUESTS.find(q => q.id === questId);
        if (mockQuest) {
          setQuest(mockQuest);
        } else {
          setError('Failed to fetch quest');
        }
      } else {
        setError('Failed to fetch quest');
      }
    } finally {
      setLoading(false);
    }
  }, [questId, isMockDataEnabled]);

  useEffect(() => {
    fetchQuest();
  }, [fetchQuest]);

  return { data: quest, isLoading: loading, error, refetch: fetchQuest };
}

/**
 * Hook to fetch quest board
 */
export function useQuestBoard() {
  const { isMockDataEnabled } = useMockData();
  const [board, setBoard] = useState<QuestBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Always use mock data for now (until backend is ready)
      // Small delay to simulate loading
      await new Promise(resolve => setTimeout(resolve, 100));
      mockDataService.register.questBoard(MOCK_QUEST_BOARD);
      setBoard(MOCK_QUEST_BOARD);
      setLoading(false);
      
      // Uncomment below when backend is ready:
      /*
      // Use mock data if enabled
      if (isMockDataEnabled) {
        await new Promise(resolve => setTimeout(resolve, 100));
        mockDataService.register.questBoard(MOCK_QUEST_BOARD);
        setBoard(MOCK_QUEST_BOARD);
        setLoading(false);
        return;
      }

      try {
        const result = await fetchJson<QuestBoard>('/api/quests/board');
        setBoard(result);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch quest board:', err);
        // Always fallback to mock data on error
        console.log('Falling back to mock quest board data');
        mockDataService.register.questBoard(MOCK_QUEST_BOARD);
        setBoard(MOCK_QUEST_BOARD);
        setLoading(false);
      }
      */
    } catch (err) {
      console.error('Error loading quest board:', err);
      setError('Failed to load quest board');
      // Fallback to mock data even on error
      mockDataService.register.questBoard(MOCK_QUEST_BOARD);
      setBoard(MOCK_QUEST_BOARD);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  return { data: board, isLoading: loading, error, refetch: fetchBoard };
}

/**
 * Hook to fetch quest analytics
 */
export function useQuestAnalytics() {
  const { isMockDataEnabled } = useMockData();
  const [analytics, setAnalytics] = useState<QuestAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use mock data if enabled
      if (isMockDataEnabled) {
        mockDataService.register.questAnalytics(MOCK_QUEST_ANALYTICS);
        setAnalytics(MOCK_QUEST_ANALYTICS);
        return;
      }

      const result = await fetchJson<QuestAnalytics>('/api/quests/analytics');
      setAnalytics(result);
    } catch (err) {
      console.error('Failed to fetch quest analytics:', err);
      // Fallback to mock data on error if not already using it
      if (!isMockDataEnabled) {
        console.log('Falling back to mock quest analytics data');
        mockDataService.register.questAnalytics(MOCK_QUEST_ANALYTICS);
        setAnalytics(MOCK_QUEST_ANALYTICS);
      } else {
        setError('Failed to fetch quest analytics');
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { data: analytics, isLoading: loading, error, refetch: fetchAnalytics };
}

/**
 * Hook to fetch quest history
 */
export function useQuestHistory(questId: string) {
  const { isMockDataEnabled } = useMockData();
  const [history, setHistory] = useState<QuestHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!questId) return;
    setLoading(true);
    setError(null);
    try {
      // Use mock data if enabled (return empty history for now)
      if (isMockDataEnabled) {
        setHistory([]);
        setLoading(false);
        return;
      }

      const result = await fetchJson<{ history: QuestHistory[] }>(`/api/quests/${questId}/history`);
      setHistory(result.history || []);
    } catch (err) {
      console.error('Failed to fetch quest history:', err);
      // For mock data, return empty history or generate some mock history
      if (!isMockDataEnabled) {
        setHistory([]);
      } else {
        setError('Failed to fetch quest history');
      }
    } finally {
      setLoading(false);
    }
  }, [questId, isMockDataEnabled]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { data: history, isLoading: loading, error, refetch: fetchHistory };
}

/**
 * Hook to fetch quest suggestions
 */
export function useQuestSuggestions() {
  const { isMockDataEnabled } = useMockData();
  const [suggestions, setSuggestions] = useState<QuestSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use mock data if enabled
      if (isMockDataEnabled) {
        mockDataService.register.questSuggestions(MOCK_QUEST_SUGGESTIONS);
        setSuggestions(MOCK_QUEST_SUGGESTIONS);
        return;
      }

      const result = await fetchJson<{ suggestions: QuestSuggestion[] }>('/api/quests/suggestions');
      setSuggestions(result.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch quest suggestions:', err);
      // Fallback to mock data on error if not already using it
      if (!isMockDataEnabled) {
        console.log('Falling back to mock quest suggestions data');
        mockDataService.register.questSuggestions(MOCK_QUEST_SUGGESTIONS);
        setSuggestions(MOCK_QUEST_SUGGESTIONS);
      } else {
        setError('Failed to fetch quest suggestions');
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return { data: suggestions, isLoading: loading, error, refetch: fetchSuggestions };
}

/**
 * Hook to create a quest
 */
export function useCreateQuest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (questData: any) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ quest: Quest }>('/api/quests', {
        method: 'POST',
        body: JSON.stringify(questData),
      });
      return result.quest;
    } catch (err) {
      console.error('Failed to create quest:', err);
      setError('Failed to create quest');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

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
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/link/goal`, {
        method: 'POST',
        body: JSON.stringify({ goal_id: goalId }),
      });
      return result.quest;
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
      const result = await fetchJson<{ quest: Quest }>(`/api/quests/${questId}/link/task`, {
        method: 'POST',
        body: JSON.stringify({ task_id: taskId }),
      });
      return result.quest;
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

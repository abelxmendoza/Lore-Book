import type {
  Quest,
  QuestAnalytics,
  QuestBoard,
  QuestFilters,
  QuestHistory,
  QuestSuggestion,
} from '../../types/quest';

import { baseApi } from './baseApi';
import { buildQuestFiltersQuery } from './questQueryUtils';

const questBoardTags = [{ type: 'Quest' as const, id: 'BOARD' }];
const questListTags = [
  { type: 'Quest' as const, id: 'LIST' },
  { type: 'Quest' as const, id: 'BOARD' },
  { type: 'Quest' as const, id: 'ANALYTICS' },
  { type: 'Quest' as const, id: 'SUGGESTIONS' },
];

function questDetailTags(questId: string) {
  return [
    { type: 'Quest' as const, id: questId },
    { type: 'Quest' as const, id: 'LIST' },
    { type: 'Quest' as const, id: 'BOARD' },
    { type: 'Quest' as const, id: 'ANALYTICS' },
  ];
}

/**
 * Server-state for quests: board, analytics, suggestions, and lifecycle mutations.
 * Separate from `entitiesApi` (character/location/org books) for clearer boundaries.
 */
export const questsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getQuestsList: build.query<{ quests: Quest[] }, QuestFilters | void>({
      query: (filters) => ({ url: `/api/quests${buildQuestFiltersQuery(filters ?? undefined)}` }),
      transformResponse: (res: { quests?: Quest[] }) => ({ quests: res.quests ?? [] }),
      providesTags: (result) =>
        result?.quests?.length
          ? [
              { type: 'Quest', id: 'LIST' },
              ...result.quests.map((q) => ({ type: 'Quest' as const, id: q.id })),
            ]
          : [{ type: 'Quest', id: 'LIST' }],
    }),
    getQuestById: build.query<{ quest: Quest }, string>({
      query: (questId) => ({ url: `/api/quests/${questId}` }),
      transformResponse: (res: { quest: Quest }) => res,
      providesTags: (_res, _err, questId) => [{ type: 'Quest', id: questId }],
    }),
    getQuestBoard: build.query<QuestBoard, void>({
      query: () => ({ url: '/api/quests/board' }),
      providesTags: [{ type: 'Quest', id: 'BOARD' }],
    }),
    getQuestAnalytics: build.query<QuestAnalytics, void>({
      query: () => ({ url: '/api/quests/analytics' }),
      providesTags: [{ type: 'Quest', id: 'ANALYTICS' }],
    }),
    getQuestHistory: build.query<{ history: QuestHistory[] }, string>({
      query: (questId) => ({ url: `/api/quests/${questId}/history` }),
      transformResponse: (res: { history?: QuestHistory[] }) => ({
        history: res.history ?? [],
      }),
      providesTags: (_res, _err, questId) => [{ type: 'Quest', id: `${questId}-history` }],
    }),
    getQuestSuggestions: build.query<{ suggestions: QuestSuggestion[] }, void>({
      query: () => ({ url: '/api/quests/suggestions' }),
      transformResponse: (res: { suggestions?: QuestSuggestion[] }) => ({
        suggestions: res.suggestions ?? [],
      }),
      providesTags: [{ type: 'Quest', id: 'SUGGESTIONS' }],
    }),

    createQuest: build.mutation<{ quest: Quest }, Record<string, unknown>>({
      query: (body) => ({ url: '/api/quests', method: 'POST', body }),
      transformResponse: (res: { quest: Quest }) => res,
      invalidatesTags: questListTags,
    }),
    updateQuest: build.mutation<{ quest: Quest }, { questId: string; updates: Record<string, unknown> }>({
      query: ({ questId, updates }) => ({
        url: `/api/quests/${questId}`,
        method: 'PUT',
        body: updates,
      }),
      invalidatesTags: (_res, _err, { questId }) => questDetailTags(questId),
    }),
    deleteQuest: build.mutation<void, string>({
      query: (questId) => ({ url: `/api/quests/${questId}`, method: 'DELETE' }),
      invalidatesTags: (_res, _err, questId) => questDetailTags(questId),
    }),
    startQuest: build.mutation<{ quest: Quest }, string>({
      query: (questId) => ({ url: `/api/quests/${questId}/start`, method: 'POST' }),
      invalidatesTags: (_res, _err, questId) => [
        { type: 'Quest', id: questId },
        ...questBoardTags,
      ],
    }),
    completeQuest: build.mutation<{ quest: Quest }, { questId: string; notes?: string }>({
      query: ({ questId, notes }) => ({
        url: `/api/quests/${questId}/complete`,
        method: 'POST',
        body: { notes },
      }),
      invalidatesTags: (_res, _err, { questId }) => [
        ...questDetailTags(questId),
      ],
    }),
    abandonQuest: build.mutation<{ quest: Quest }, { questId: string; reason?: string }>({
      query: ({ questId, reason }) => ({
        url: `/api/quests/${questId}/abandon`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (_res, _err, { questId }) => [
        { type: 'Quest', id: questId },
        ...questBoardTags,
      ],
    }),
    pauseQuest: build.mutation<{ quest: Quest }, string>({
      query: (questId) => ({ url: `/api/quests/${questId}/pause`, method: 'POST' }),
      invalidatesTags: (_res, _err, questId) => [
        { type: 'Quest', id: questId },
        ...questBoardTags,
      ],
    }),
    updateQuestProgress: build.mutation<{ quest: Quest }, { questId: string; progress: number }>({
      query: ({ questId, progress }) => ({
        url: `/api/quests/${questId}/progress`,
        method: 'POST',
        body: { progress },
      }),
      invalidatesTags: (_res, _err, { questId }) => [
        { type: 'Quest', id: questId },
        ...questBoardTags,
      ],
    }),
    addQuestReflection: build.mutation<{ history: QuestHistory }, { questId: string; reflection: string }>({
      query: ({ questId, reflection }) => ({
        url: `/api/quests/${questId}/reflect`,
        method: 'POST',
        body: { reflection },
      }),
      invalidatesTags: (_res, _err, { questId }) => [
        { type: 'Quest', id: questId },
        { type: 'Quest', id: `${questId}-history` },
      ],
    }),
    addQuestDependency: build.mutation<
      { dependency: Record<string, unknown> },
      { questId: string; dependsOnQuestId: string }
    >({
      query: ({ questId, dependsOnQuestId }) => ({
        url: `/api/quests/${questId}/dependencies`,
        method: 'POST',
        body: { depends_on_quest_id: dependsOnQuestId },
      }),
      invalidatesTags: (_res, _err, { questId }) => [{ type: 'Quest', id: questId }],
    }),
    linkQuestToGoal: build.mutation<{ success: boolean }, { questId: string; goalId: string }>({
      query: ({ questId, goalId }) => ({
        url: `/api/quests/${questId}/link-goal`,
        method: 'POST',
        body: { goal_id: goalId },
      }),
      invalidatesTags: (_res, _err, { questId }) => questDetailTags(questId),
    }),
    linkQuestToTask: build.mutation<{ success: boolean }, { questId: string; taskId: string }>({
      query: ({ questId, taskId }) => ({
        url: `/api/quests/${questId}/link-task`,
        method: 'POST',
        body: { task_id: taskId },
      }),
      invalidatesTags: (_res, _err, { questId }) => questDetailTags(questId),
    }),
    convertGoalToQuest: build.mutation<{ quest: Quest }, string>({
      query: (goalId) => ({ url: `/api/quests/convert/goal/${goalId}`, method: 'POST' }),
      invalidatesTags: questListTags,
    }),
    convertTaskToQuest: build.mutation<{ quest: Quest }, string>({
      query: (taskId) => ({ url: `/api/quests/convert/task/${taskId}`, method: 'POST' }),
      invalidatesTags: questListTags,
    }),
  }),
});

export const {
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
} = questsApi;

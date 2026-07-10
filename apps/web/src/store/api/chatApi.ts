import { baseApi } from './baseApi';

/** Raw thread row from `/api/conversation/threads`. */
export type DbThreadRow = {
  id: string;
  title?: string;
  updated_at?: string;
  created_at?: string;
  message_count?: number;
  /** Per-user sequential reference number (#N) — null until migration applied. */
  thread_number?: number | null;
  metadata?: Record<string, unknown>;
};

export type ThreadsListResponse = {
  threads: DbThreadRow[];
  success: boolean;
  total?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
};

export type ThreadMessagesResponse = {
  success: boolean;
  thread_number?: number | null;
  messages: Array<Record<string, unknown>>;
};

export type ThreadStatusResponse = {
  success: boolean;
  status?: { protected?: boolean; messageCount?: number };
};

export type ThreadTitleGenerationResult = {
  success: boolean;
  title?: string;
  subtitle?: string;
  dominantEntities?: string[];
};

export type ForkThreadResponse = {
  success: boolean;
  thread?: { id: string };
};

/**
 * Server-state for conversation threads and per-thread messages.
 *
 * Local optimistic state (guest localStorage, in-memory message merges) still
 * lives in `useChatThreads`; this API owns authoritative server reads and
 * mutations with cache tags for invalidation.
 */
export const chatApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getThreads: build.query<ThreadsListResponse, { limit?: number; cursor?: string | null } | void>({
      query: (arg) => {
        const limit = arg?.limit ?? 30;
        const cursor = arg?.cursor;
        const url =
          cursor != null && cursor !== ''
            ? `/api/conversation/threads?limit=${limit}&cursor=${encodeURIComponent(cursor)}`
            : `/api/conversation/threads?limit=${limit}`;
        return { url };
      },
      transformResponse: (res: Partial<ThreadsListResponse>) => ({
        success: res.success ?? true,
        threads: res.threads ?? [],
        total: res.total,
        hasMore: res.hasMore,
        nextCursor: res.nextCursor ?? null,
      }),
      providesTags: (result) =>
        result?.threads?.length
          ? [
              { type: 'ChatThread', id: 'LIST' },
              ...result.threads.map((t) => ({ type: 'ChatThread' as const, id: t.id })),
            ]
          : [{ type: 'ChatThread', id: 'LIST' }],
    }),

    getThreadMessages: build.query<ThreadMessagesResponse, string>({
      query: (threadId) => ({ url: `/api/conversation/threads/${threadId}/messages` }),
      transformResponse: (res: Partial<ThreadMessagesResponse>) => ({
        success: res.success ?? true,
        thread_number: res.thread_number ?? null,
        messages: res.messages ?? [],
      }),
      providesTags: (_result, _err, threadId) => [
        { type: 'ChatMessage', id: threadId },
        { type: 'ChatThread', id: threadId },
      ],
    }),

    repairChatHealth: build.mutation<{ repaired: number; report: Record<string, unknown> }, void>({
      query: () => ({ url: '/api/chat-threads/health/repair', method: 'POST' }),
    }),

    recoverThreadOrphans: build.mutation<{ success: boolean; recovered?: number }, void>({
      query: () => ({ url: '/api/conversation/threads/recover-orphans', method: 'POST' }),
    }),

    ensureThreadVisible: build.mutation<
      { success: boolean; thread?: { title?: string; subtitle?: string; updatedAt?: string } },
      string
    >({
      query: (threadId) => ({
        url: `/api/conversation/threads/${threadId}/ensure-visible`,
        method: 'POST',
      }),
      invalidatesTags: (_res, _err, threadId) => [{ type: 'ChatThread', id: threadId }],
    }),

    createThread: build.mutation<{ success: boolean }, { id: string; title: string }>({
      query: (body) => ({ url: '/api/conversation/threads', method: 'POST', body }),
      invalidatesTags: [{ type: 'ChatThread', id: 'LIST' }],
    }),

    updateThread: build.mutation<
      { success: boolean },
      { threadId: string; body: Record<string, unknown> }
    >({
      query: ({ threadId, body }) => ({
        url: `/api/conversation/threads/${threadId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_res, _err, { threadId }) => [
        { type: 'ChatThread', id: threadId },
        { type: 'ChatThread', id: 'LIST' },
      ],
    }),

    patchThreadTitle: build.mutation<
      { success: boolean },
      { threadId: string; title: string }
    >({
      query: ({ threadId, title }) => ({
        url: `/api/conversation/threads/${threadId}/title`,
        method: 'PATCH',
        body: { title },
      }),
      invalidatesTags: (_res, _err, { threadId }) => [
        { type: 'ChatThread', id: threadId },
        { type: 'ChatThread', id: 'LIST' },
      ],
    }),

    deleteThread: build.mutation<{ success: boolean }, string>({
      query: (threadId) => ({
        url: `/api/conversation/threads/${threadId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, threadId) => [
        { type: 'ChatThread', id: threadId },
        { type: 'ChatMessage', id: threadId },
        { type: 'ChatThread', id: 'LIST' },
      ],
    }),

    getThreadStatus: build.query<ThreadStatusResponse, string>({
      query: (threadId) => ({ url: `/api/conversation/threads/${threadId}/status` }),
      transformResponse: (res: Partial<ThreadStatusResponse>) => ({
        success: res.success ?? true,
        status: res.status,
      }),
      providesTags: (_res, _err, threadId) => [{ type: 'ChatThread', id: threadId }],
    }),

    generateThreadTitle: build.mutation<
      ThreadTitleGenerationResult,
      {
        threadId: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        modeDecision?: string;
      }
    >({
      query: ({ threadId, messages, modeDecision }) => ({
        url: `/api/conversation/threads/${threadId}/title`,
        method: 'POST',
        body: {
          messages,
          ...(modeDecision ? { modeDecision } : {}),
        },
      }),
      invalidatesTags: (_res, _err, { threadId }) => [
        { type: 'ChatThread', id: threadId },
        { type: 'ChatThread', id: 'LIST' },
      ],
    }),

    forkThread: build.mutation<ForkThreadResponse, { sourceThreadId: string; messageId?: string }>({
      query: ({ sourceThreadId, messageId }) => ({
        url: `/api/conversation/threads/${sourceThreadId}/fork`,
        method: 'POST',
        body: { message_id: messageId },
      }),
      invalidatesTags: [{ type: 'ChatThread', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetThreadsQuery,
  useLazyGetThreadsQuery,
  useGetThreadMessagesQuery,
  useLazyGetThreadMessagesQuery,
  useRepairChatHealthMutation,
  useRecoverThreadOrphansMutation,
  useEnsureThreadVisibleMutation,
  useCreateThreadMutation,
  useUpdateThreadMutation,
  usePatchThreadTitleMutation,
  useDeleteThreadMutation,
  useGetThreadStatusQuery,
  useLazyGetThreadStatusQuery,
  useGenerateThreadTitleMutation,
  useForkThreadMutation,
} = chatApi;

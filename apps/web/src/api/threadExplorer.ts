import { fetchJson } from '../lib/api';

export type ThreadExploreHit = {
  threadId: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  score: number;
  messageCount: number;
  matchReasons: string[];
  snippets: Array<{
    role: 'user' | 'assistant';
    excerpt: string;
    messageIndex?: number;
    messageId?: string;
  }>;
  entities: string[];
  knowledge: Array<{
    id: string;
    claim: string;
    confidence: number;
    knowledgeType?: string;
  }>;
};

export type ThreadFacets = {
  entities: Array<{ name: string; count: number }>;
  subtitles: Array<{ name: string; count: number }>;
  totalThreads: number;
  totalMessages: number;
  keywords?: string[];
};

export type ThreadContext = {
  threadId: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  entities: string[];
  messageCount: number;
  messages: Array<{
    index: number;
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: string;
  }>;
  knowledge: ThreadExploreHit['knowledge'];
  extractedSummary: string[];
  keywords: string[];
};

export const threadExplorerApi = {
  explore: (params?: { q?: string; entity?: string; limit?: number; since?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.entity) qs.set('entity', params.entity);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.since) qs.set('since', params.since);
    const query = qs.toString();
    return fetchJson<{
      success: boolean;
      hits: ThreadExploreHit[];
      facets: ThreadFacets;
      query: string | null;
    }>(`/api/conversation/threads/explore${query ? `?${query}` : ''}`);
  },

  facets: () =>
    fetchJson<{ success: boolean; facets: ThreadFacets }>('/api/conversation/threads/facets'),

  context: (threadId: string) =>
    fetchJson<{ success: boolean; context: ThreadContext }>(
      `/api/conversation/threads/${threadId}/context`
    ),
};

import { fetchJson } from '../lib/api';

export type ThreadSummaryPayload = {
  short: string | null;
  medium: string | null;
  long: string | null;
  version: number;
  messageCount: number;
  people: string[];
  places: string[];
  themes: string[];
};

export type ThreadSummaryResponse = {
  success: boolean;
  summary: ThreadSummaryPayload;
  continuity: string;
  recallText: string;
};

export async function fetchThreadSummary(threadId: string): Promise<ThreadSummaryResponse> {
  return fetchJson<ThreadSummaryResponse>(`/api/conversation/threads/${threadId}/summary`);
}

export async function refreshThreadSummary(threadId: string): Promise<ThreadSummaryResponse> {
  return fetchJson<ThreadSummaryResponse>(`/api/conversation/threads/${threadId}/summary/refresh`, {
    method: 'POST',
  });
}

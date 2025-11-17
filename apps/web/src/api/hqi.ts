import { fetchJson } from '../lib/api';

export type HQIResult = {
  id: string;
  type: 'memory' | 'task' | 'character' | 'arc' | 'motif';
  title: string;
  snippet?: string;
  score?: number;
  tags?: string[];
};

export type HQISearchPayload = {
  query: string;
  filters?: Record<string, string | string[]>;
};

export const searchHQI = (payload: HQISearchPayload) =>
  fetchJson<{ results: HQIResult[] }>('/api/hqi/search', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

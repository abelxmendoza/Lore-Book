import { fetchJson } from '../lib/api';

export type CanonFact = { id: string; description: string; confidence: number };
export type ContinuityConflict = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  details?: string;
};

export type ContinuitySnapshot = {
  stability: number;
  facts: CanonFact[];
  conflicts: ContinuityConflict[];
};

export const fetchContinuity = () => fetchJson<{ continuity: ContinuitySnapshot }>('/api/continuity');

export const fetchMergeSuggestions = () =>
  fetchJson<{ suggestions: { id: string; title: string; rationale: string }[] }>('/api/continuity/merge');

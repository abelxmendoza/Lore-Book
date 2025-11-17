import { fetchJson } from '../lib/api';

export type SagaChapter = { id: string; title: string; summary: string; turningPoint?: boolean };

export type SagaOverview = {
  era: string;
  arcs: { id: string; label: string; intensity: number }[];
  chapters: SagaChapter[];
};

export const fetchSaga = () => fetchJson<{ saga: SagaOverview }>('/api/saga');

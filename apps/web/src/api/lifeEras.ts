import { fetchJson } from '../lib/api';

export type LifeEraRecord = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  thesis: string | null;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  participants: string[];
  chapter_ids: string[];
  scene_ids: string[];
  event_ids: string[];
  themes: string[];
  dominant_emotion: string | null;
  is_current: boolean;
  significance_score: number;
  confidence: number;
  thread_id: string | null;
  metadata: Record<string, unknown>;
};

export const lifeErasApi = {
  list: (opts?: { limit?: number }) => {
    const qs = opts?.limit ? `?limit=${opts.limit}` : '';
    return fetchJson<{
      success: boolean;
      eras: LifeEraRecord[];
      eraCount: number;
    }>(`/api/story/life-eras${qs}`);
  },
};

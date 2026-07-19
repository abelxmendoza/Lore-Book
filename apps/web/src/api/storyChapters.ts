import { fetchJson } from '../lib/api';

export type StoryChapter = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  thesis: string | null;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  participants: string[];
  scene_ids: string[];
  event_ids: string[];
  themes: string[];
  dominant_emotion: string | null;
  significance_score: number;
  confidence: number;
  thread_id: string | null;
  metadata: Record<string, unknown>;
};

export const storyChaptersApi = {
  list: (opts?: { limit?: number }) => {
    const qs = opts?.limit ? `?limit=${opts.limit}` : '';
    return fetchJson<{
      success: boolean;
      chapters: StoryChapter[];
      chapterCount: number;
    }>(`/api/story/story-chapters${qs}`);
  },
};

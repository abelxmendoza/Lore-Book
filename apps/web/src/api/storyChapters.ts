import { fetchJson } from '../lib/api';

export type StoryChapterContribution = {
  sceneId: string;
  strength: number;
  classification: 'supporting' | 'peripheral' | 'excluded' | string;
  reasons?: string[];
};

export type StoryChapterOwnership = {
  primaryNarrative: string;
  primarySubject: string | null;
  primaryConflict: string | null;
  primaryOutcome: string | null;
  domain: string;
};

export type StoryChapter = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  thesis: string | null;
  primary_narrative?: string | null;
  primary_subject?: string | null;
  primary_conflict?: string | null;
  primary_outcome?: string | null;
  contribution_scores?: Record<string, number>;
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

export type StoryChapterReprocessResult = {
  success: boolean;
  scenes: number;
  assembled: number;
  published: number;
  rejected: number;
  erasPublished: number;
  clearedChapters: number;
  chapters: StoryChapter[];
};

export function getChapterOwnership(chapter: StoryChapter): StoryChapterOwnership | null {
  const meta = chapter.metadata?.ownership as StoryChapterOwnership | undefined;
  if (meta?.primaryNarrative || meta?.domain) return meta;
  if (!chapter.primary_narrative && !chapter.primary_subject) return null;
  return {
    primaryNarrative: chapter.primary_narrative || chapter.thesis || '',
    primarySubject: chapter.primary_subject ?? null,
    primaryConflict: chapter.primary_conflict ?? null,
    primaryOutcome: chapter.primary_outcome ?? null,
    domain: typeof chapter.metadata?.domain === 'string' ? chapter.metadata.domain : 'unknown',
  };
}

export function getChapterContributions(chapter: StoryChapter): StoryChapterContribution[] {
  const fromMeta = chapter.metadata?.contributions;
  if (Array.isArray(fromMeta)) {
    return fromMeta as StoryChapterContribution[];
  }
  const scores = chapter.contribution_scores ?? {};
  return Object.entries(scores).map(([sceneId, strength]) => ({
    sceneId,
    strength: Number(strength),
    classification: Number(strength) >= 60 ? 'supporting' : 'peripheral',
  }));
}

export const storyChaptersApi = {
  list: (opts?: { limit?: number }) => {
    const qs = opts?.limit ? `?limit=${opts.limit}` : '';
    return fetchJson<{
      success: boolean;
      chapters: StoryChapter[];
      chapterCount: number;
    }>(`/api/story/story-chapters${qs}`);
  },

  reprocess: () =>
    fetchJson<StoryChapterReprocessResult>('/api/story/story-chapters/reprocess', {
      method: 'POST',
    }),
};

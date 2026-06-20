import { fetchJson } from '../lib/api';

export type LifeEventCategory =
  | 'education'
  | 'career'
  | 'move'
  | 'achievement'
  | 'failure'
  | 'health'
  | 'financial'
  | 'social'
  | 'relationship'
  | 'life_context'
  | 'other';

export type ClassifiedLifeEvent = {
  id: string;
  title: string;
  summary: string | null;
  startTime: string;
  endTime: string | null;
  legacyType: string | null;
  category: LifeEventCategory;
  relationshipSubtype: string | null;
  significance: number;
  confidence: number;
  peopleCount: number;
  evidenceCount: number;
};

export type LifeHistoryChapter = {
  id: string;
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  dominantCategory: LifeEventCategory;
  themes: string[];
  significance: number;
  eventCount: number;
  turningPointCount: number;
  events: ClassifiedLifeEvent[];
};

export type LifeHistoryReport = {
  generatedAt: string;
  eventCount: number;
  chapterCount: number;
  turningPointCount: number;
  categoryCounts: Partial<Record<LifeEventCategory, number>>;
  chapters: LifeHistoryChapter[];
  turningPoints: Array<{
    id: string;
    title: string;
    date: string | null;
    kind: string;
    importance: number;
    confidence: number;
  }>;
  topEvents: ClassifiedLifeEvent[];
};

export const lifeHistoryApi = {
  getLifeHistory: () =>
    fetchJson<{ success: boolean; history: LifeHistoryReport }>('/api/story/life-history'),

  getLifeChapters: () =>
    fetchJson<{
      success: boolean;
      generatedAt: string;
      chapters: LifeHistoryChapter[];
      eventCount: number;
    }>('/api/story/life-chapters'),
};

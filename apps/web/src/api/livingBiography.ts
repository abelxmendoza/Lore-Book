import { fetchJson } from '../lib/api';

export type CurrentChapter = {
  label: string;
  evidence: string[];
};

export type LivingBiographyPerson = {
  name: string;
  relationship: string;
  status: string;
};

export type LivingBiographyCard = {
  name: string | null;
  currentChapter: CurrentChapter | null;
  topThemes: string[];
  keyPeople: LivingBiographyPerson[];
  currentFocus: string[];
  recentDevelopments: string[];
  lastUpdated: string | null;
  hasEnoughData: boolean;
};

export type BiographyChange = {
  kind: 'new_chapter' | 'new_person' | 'new_milestone' | 'emerging_theme';
  label: string;
};

export const fetchLivingBiographyCard = () =>
  fetchJson<{ success: boolean; card: LivingBiographyCard }>('/api/biography/living');

export const fetchBiographyChanges = (since: string) =>
  fetchJson<{ success: boolean; changes: BiographyChange[] }>(
    `/api/biography/living/changes?since=${encodeURIComponent(since)}`
  );

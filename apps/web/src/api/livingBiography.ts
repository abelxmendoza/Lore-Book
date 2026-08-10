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

export type IdentityThreadSummary = {
  id: string;
  domain: string;
  name: string;
  summary: string;
  salience: 'dominant' | 'significant' | 'supporting';
  stability: 'stable' | 'evolving' | 'volatile';
  momentum: 'growing' | 'steady' | 'declining' | 'dormant';
  trajectory: 'emerging' | 'continuing' | 'transforming' | 'fading';
  strength: number;
  confidence: number;
};

export type IdentityCoverageSummary = {
  domain: string;
  score: number;
  band: 'strong' | 'developing' | 'sparse' | 'unknown';
};

export type IdentitySnapshotSummary = {
  id: string;
  generatedAt: string;
  algorithmVersion: string;
  stale: boolean;
  confidence: number;
  currentChapter: { title: string; summary: string; confidence: number } | null;
  threads: IdentityThreadSummary[];
  goals: Array<{ id: string; title: string; status: string }>;
  coverage: IdentityCoverageSummary[];
};

export type BiographyChange = {
  kind: 'new_chapter' | 'new_person' | 'new_milestone' | 'emerging_theme';
  label: string;
};

export const fetchLivingBiographyCard = () =>
  fetchJson<{
    success: boolean;
    card: LivingBiographyCard;
    identitySnapshot?: IdentitySnapshotSummary;
  }>('/api/biography/living');

export const fetchIdentitySnapshot = () =>
  fetchJson<{ success: boolean; snapshot: IdentitySnapshotSummary }>('/api/biography/identity-snapshot');

export const fetchBiographyChanges = (since: string) =>
  fetchJson<{ success: boolean; changes: BiographyChange[] }>(
    `/api/biography/living/changes?since=${encodeURIComponent(since)}`
  );

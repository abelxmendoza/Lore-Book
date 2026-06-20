/** Client types + fetch helpers for LoreBook Chronicle admin API. */

import { fetchJson } from '../lib/api';
import { config } from '../config/env';

export enum MilestoneSignificance {
  TRIVIAL = 1,
  MINOR = 2,
  MODERATE = 3,
  MAJOR = 4,
  TRANSFORMATIONAL = 5,
}

export enum DevelopmentStage {
  IDEA = 'IDEA',
  PROTOTYPE = 'PROTOTYPE',
  MVP = 'MVP',
  BETA = 'BETA',
  PUBLIC_RELEASE = 'PUBLIC_RELEASE',
  PLATFORM = 'PLATFORM',
  ECOSYSTEM = 'ECOSYSTEM',
}

export interface ChronicleEntity {
  id: string;
  kind: string;
  name: string;
  title?: string;
  fields: Record<string, string | string[] | number>;
}

export interface ChronicleMilestone {
  id: string;
  slug: string;
  title: string;
  summary: string;
  occurredAt: string;
  significance: MilestoneSignificance;
  category: string;
  chapterId?: string;
  stars?: number;
}

export interface ChronicleVisionSnapshot {
  id: string;
  version: number;
  label: string;
  vision: string;
  recordedAt: string;
}

export interface ChronicleChapter {
  id: string;
  slug: string;
  title: string;
  eraLabel: string;
  summary: string;
  sortOrder: number;
  milestoneIds: string[];
}

export interface ChronicleStage {
  current: DevelopmentStage;
  progressPercent: number;
  label: string;
  updatedAt: string;
}

export interface PendingDetection {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  significance: MilestoneSignificance;
  category: string;
  source: string;
  sourceRef?: string;
  detectedAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface FounderStats {
  entityId: string;
  name: string;
  featuresAuthored: number;
  majorMilestones: number;
  transformationalChanges: number;
  visionUpdates: number;
}

export interface ProjectChronicleSnapshot {
  product: ChronicleEntity;
  organization: ChronicleEntity;
  founder: ChronicleEntity;
  stage: ChronicleStage;
  visionEvolution: ChronicleVisionSnapshot[];
  milestones: ChronicleMilestone[];
  chapters: ChronicleChapter[];
  leaderboard: ChronicleMilestone[];
  founderStats: FounderStats;
  selfNarrative: {
    title: string;
    subtitle: string;
    chapters: Array<{ chapterNumber: number; title: string; body: string }>;
  };
  pendingDetections: PendingDetection[];
  lastRefreshedAt: string;
  generatedAt: string;
}

const CHRONICLE_OPTS = { timeoutMs: config.api.adminTimeout } as const;

export async function fetchChronicle(refresh = false): Promise<ProjectChronicleSnapshot> {
  if (refresh) {
    const res = await fetchJson<{ chronicle: ProjectChronicleSnapshot }>(
      '/api/admin/chronicle/refresh',
      { method: 'POST' },
      CHRONICLE_OPTS,
    );
    return res.chronicle;
  }
  return fetchJson<ProjectChronicleSnapshot>('/api/admin/chronicle', undefined, CHRONICLE_OPTS);
}

export async function acceptChronicleDetection(id: string): Promise<ProjectChronicleSnapshot> {
  const res = await fetchJson<{ chronicle: ProjectChronicleSnapshot }>(
    `/api/admin/chronicle/detections/${id}/accept`,
    { method: 'POST' },
    CHRONICLE_OPTS,
  );
  return res.chronicle;
}

export async function rejectChronicleDetection(id: string): Promise<ProjectChronicleSnapshot> {
  const res = await fetchJson<{ chronicle: ProjectChronicleSnapshot }>(
    `/api/admin/chronicle/detections/${id}/reject`,
    { method: 'POST' },
    CHRONICLE_OPTS,
  );
  return res.chronicle;
}

export function significanceStars(n: MilestoneSignificance | number): string {
  const count = Math.min(5, Math.max(1, Number(n)));
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

export function formatChronicleMonth(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

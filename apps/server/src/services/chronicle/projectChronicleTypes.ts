/** LoreBook Chronicle — project self-history types (Phase 1: LoreBook itself). */

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

export enum ChronicleEntityKind {
  FOUNDER = 'founder',
  ORGANIZATION = 'organization',
  PRODUCT = 'product',
}

export enum MilestoneCategory {
  NEW_CAPABILITY = 'new_capability',
  ARCHITECTURE = 'architecture',
  UX_RELEASE = 'ux_release',
  TECHNICAL_BREAKTHROUGH = 'technical_breakthrough',
  VISION = 'vision',
  FOUNDING = 'founding',
  OTHER = 'other',
}

export enum DetectionSource {
  GIT_COMMIT = 'git_commit',
  README = 'readme',
  DOCUMENTATION = 'documentation',
  CHAT = 'chat',
  PULL_REQUEST = 'pull_request',
  MANUAL = 'manual',
}

export interface ChronicleEntity {
  id: string;
  kind: ChronicleEntityKind;
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
  category: MilestoneCategory;
  chapterId?: string;
  source?: DetectionSource;
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
  category: MilestoneCategory;
  source: DetectionSource;
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

export interface SelfNarrativeChapter {
  chapterNumber: number;
  title: string;
  body: string;
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
    chapters: SelfNarrativeChapter[];
  };
  pendingDetections: PendingDetection[];
  lastRefreshedAt: string;
  generatedAt: string;
}

export const STAGE_ORDER: DevelopmentStage[] = [
  DevelopmentStage.IDEA,
  DevelopmentStage.PROTOTYPE,
  DevelopmentStage.MVP,
  DevelopmentStage.BETA,
  DevelopmentStage.PUBLIC_RELEASE,
  DevelopmentStage.PLATFORM,
  DevelopmentStage.ECOSYSTEM,
];

export function significanceToStars(significance: MilestoneSignificance): number {
  return significance;
}

export function significanceLabel(significance: MilestoneSignificance): string {
  switch (significance) {
    case MilestoneSignificance.TRIVIAL: return 'Trivial';
    case MilestoneSignificance.MINOR: return 'Minor';
    case MilestoneSignificance.MODERATE: return 'Moderate';
    case MilestoneSignificance.MAJOR: return 'Major';
    case MilestoneSignificance.TRANSFORMATIONAL: return 'Transformational';
    default: return 'Unknown';
  }
}

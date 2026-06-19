import type { BiographySpec, Domain, NarrativeAtomType } from '../biographyGeneration/types';

export type LoreReadinessLevel = 'needs_more' | 'building' | 'ready';

export type LoreTopicId =
  | 'full_life'
  | 'professional'
  | 'relationships'
  | 'family'
  | 'creative'
  | 'health'
  | 'education'
  | 'personal'
  | 'character_book'
  | 'place_book';

export type ReadinessGapSeverity = 'blocker' | 'warning';

export type ReadinessGap = {
  id: string;
  label: string;
  severity: ReadinessGapSeverity;
  suggestion?: string;
  current: number;
  required: number;
};

export type ReadinessDimensionScores = {
  volume: number;
  diversity: number;
  anchoring: number;
  temporal: number;
  evidence: number;
};

export type EntityReadinessCandidate = {
  id: string;
  name: string;
  atomCount: number;
  entryCount: number;
  progress: number;
  canGenerate: boolean;
};

export type LoreTopicDefinition = {
  id: LoreTopicId;
  label: string;
  description: string;
  scope: 'full_life' | 'domain' | 'thematic';
  domain?: string;
  minAtoms: number;
  minEntries: number;
  minEntities?: { characters?: number; locations?: number };
  minAtomTypes?: Partial<Record<NarrativeAtomType, number>>;
  minTimeSpanMonths?: number;
  minWords?: number;
  minEvidenceScore?: number;
};

export type ContentStatsSnapshot = {
  totalJournalEntries: number;
  totalChatMessages: number;
  totalNarrativeAtoms: number;
  totalWordCount: number;
  domainCoverage: Array<{ domain: string; atomCount: number; entryCount: number }>;
  entityCounts: {
    characters: number;
    locations: number;
    events: number;
    skills: number;
  };
};

export type LoreTopicReadiness = {
  topic: LoreTopicDefinition;
  level: LoreReadinessLevel;
  progress: number;
  atomCount: number;
  entryCount: number;
  wordCount: number;
  atomsNeeded: number;
  entriesNeeded: number;
  canGenerate: boolean;
  gaps: ReadinessGap[];
  dimensionScores: ReadinessDimensionScores;
  entityCandidates?: EntityReadinessCandidate[];
};

export type LoreReadinessSummary = {
  stats: ContentStatsSnapshot;
  overallProgress: number;
  overallLevel: LoreReadinessLevel;
  canGenerateAnyBook: boolean;
  topics: LoreTopicReadiness[];
  readyTopicCount: number;
  buildingTopicCount: number;
  knowledgeScore: number;
};

export type LoreReadinessEvaluateRequest = {
  query?: string;
  spec?: Partial<BiographySpec> & {
    characterIds?: string[];
    locationIds?: string[];
    eventIds?: string[];
    skillIds?: string[];
  };
  characterId?: string;
  locationId?: string;
  topicId?: LoreTopicId;
  depth?: 'summary' | 'detailed' | 'epic';
};

export type LoreReadinessEvaluation = {
  label: string;
  spec: BiographySpec & {
    characterIds?: string[];
    locationIds?: string[];
    eventIds?: string[];
    skillIds?: string[];
  };
  level: LoreReadinessLevel;
  progress: number;
  canGenerate: boolean;
  atomCount: number;
  entryCount: number;
  wordCount: number;
  estimatedPages: number;
  atomsNeeded: number;
  entriesNeeded: number;
  gaps: ReadinessGap[];
  dimensionScores: ReadinessDimensionScores;
  suggestions: string[];
};

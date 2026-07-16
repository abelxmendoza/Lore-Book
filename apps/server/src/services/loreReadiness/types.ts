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

/** @deprecated Prefer FocusCandidate — kept for ledger / older clients. */
export type EntityReadinessCandidate = {
  id: string;
  name: string;
  atomCount: number;
  entryCount: number;
  progress: number;
  canGenerate: boolean;
};

export type FocusKind =
  | 'character'
  | 'location'
  | 'organization'
  | 'skill'
  | 'event'
  | 'era'
  | 'thread'
  | 'domain_slice';

export type FocusCompileRef = {
  characterId?: string;
  locationId?: string;
  organizationId?: string;
  skillId?: string;
  eventId?: string;
  threadId?: string;
  timeRange?: { start: string; end: string };
  themes?: string[];
};

export type FocusSignals = {
  atomCount: number;
  wordCount: number;
  entryCount: number;
  meaningClusters: number;
  threadLinks: number;
  evidenceFacts: number;
};

/** Topic-scoped compile focus — spoke around the user's self prime node. */
export type FocusCandidate = {
  id: string;
  kind: FocusKind;
  label: string;
  topicId: LoreTopicId;
  score: number;
  canCompile: boolean;
  reasons: string[];
  signals: FocusSignals;
  compileRef: FocusCompileRef;
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
  /** Preferred: multi-kind focus options for this topic. */
  focusCandidates?: FocusCandidate[];
  /** Human signal line e.g. "~2.4k words · 12 episodes". */
  signalSummary?: string;
  /** @deprecated Use focusCandidates. */
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
    organizationIds?: string[];
  };
  characterId?: string;
  locationId?: string;
  organizationId?: string;
  skillId?: string;
  threadId?: string;
  topicId?: LoreTopicId;
  depth?: 'summary' | 'detailed' | 'epic';
  timeRange?: { start: string; end: string };
  themes?: string[];
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

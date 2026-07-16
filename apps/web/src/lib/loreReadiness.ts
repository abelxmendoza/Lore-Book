/**
 * LoreBook knowledge readiness — thresholds and pure scoring helpers.
 * UI mockup layer: maps content stats → per-topic "needs more" / "building" / "ready".
 */

export type LoreReadinessLevel = 'needs_more' | 'building' | 'ready';

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

export type LoreReadinessEvaluation = {
  label: string;
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

export type LoreTopicDefinition = {
  id: LoreTopicId;
  label: string;
  description: string;
  /** Biography scope / domain hint for generation */
  scope: 'full_life' | 'domain' | 'thematic';
  domain?: string;
  minAtoms: number;
  minEntries: number;
  /** Optional entity minimum (characters, locations) */
  minEntities?: { characters?: number; locations?: number };
};

/** Minimum narrative atoms to compile any lorebook (matches server bookCapacityCalculator). */
export const MIN_ATOMS_ANY_BOOK = 20;

export const LORE_TOPICS: LoreTopicDefinition[] = [
  {
    id: 'full_life',
    label: 'Full life story',
    description: 'Chronological arc across your whole timeline',
    scope: 'full_life',
    minAtoms: 20,
    minEntries: 10,
  },
  {
    id: 'professional',
    label: 'Career & work',
    description: 'Jobs, skills, and professional growth',
    scope: 'domain',
    domain: 'professional',
    minAtoms: 8,
    minEntries: 5,
  },
  {
    id: 'relationships',
    label: 'Love & relationships',
    description: 'Romance, partnership, and connection',
    scope: 'domain',
    domain: 'relationships',
    minAtoms: 8,
    minEntries: 4,
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Parents, siblings, and home life',
    scope: 'domain',
    domain: 'family',
    minAtoms: 6,
    minEntries: 4,
  },
  {
    id: 'creative',
    label: 'Creative life',
    description: 'Art, writing, music, and projects',
    scope: 'domain',
    domain: 'creative',
    minAtoms: 6,
    minEntries: 3,
  },
  {
    id: 'health',
    label: 'Health & body',
    description: 'Wellness, fitness, and recovery',
    scope: 'domain',
    domain: 'health',
    minAtoms: 5,
    minEntries: 3,
  },
  {
    id: 'education',
    label: 'Education',
    description: 'School, training, and learning arcs',
    scope: 'domain',
    domain: 'education',
    minAtoms: 5,
    minEntries: 3,
  },
  {
    id: 'personal',
    label: 'Personal growth',
    description: 'Identity, values, and inner life',
    scope: 'domain',
    domain: 'personal',
    minAtoms: 6,
    minEntries: 4,
  },
  {
    id: 'character_book',
    label: 'A person',
    description: 'Book centered on someone in your life',
    scope: 'thematic',
    minAtoms: 6,
    minEntries: 3,
    minEntities: { characters: 2 },
  },
  {
    id: 'place_book',
    label: 'A place',
    description: 'Book about a location that shaped you',
    scope: 'thematic',
    minAtoms: 5,
    minEntries: 3,
    minEntities: { locations: 2 },
  },
];

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
  wordCount?: number;
  atomsNeeded: number;
  entriesNeeded: number;
  canGenerate: boolean;
  gaps?: ReadinessGap[];
  dimensionScores?: ReadinessDimensionScores;
  focusCandidates?: FocusCandidate[];
  signalSummary?: string;
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

function levelFromProgress(progress: number): LoreReadinessLevel {
  if (progress >= 1) return 'ready';
  if (progress >= 0.45) return 'building';
  return 'needs_more';
}

function domainStats(stats: ContentStatsSnapshot, domain?: string) {
  if (!domain) {
    return {
      atomCount: stats.totalNarrativeAtoms,
      entryCount: stats.totalJournalEntries + Math.floor(stats.totalChatMessages / 4),
    };
  }
  const row = stats.domainCoverage.find((d) => d.domain === domain);
  return {
    atomCount: row?.atomCount ?? 0,
    entryCount: row?.entryCount ?? 0,
  };
}

export function computeTopicReadiness(
  topic: LoreTopicDefinition,
  stats: ContentStatsSnapshot
): LoreTopicReadiness {
  const { atomCount, entryCount } = domainStats(stats, topic.domain);

  const atomProgress = topic.minAtoms > 0 ? atomCount / topic.minAtoms : 1;
  const entryProgress = topic.minEntries > 0 ? entryCount / topic.minEntries : 1;

  let entityProgress = 1;
  if (topic.minEntities?.characters) {
    entityProgress = Math.min(entityProgress, stats.entityCounts.characters / topic.minEntities.characters);
  }
  if (topic.minEntities?.locations) {
    entityProgress = Math.min(entityProgress, stats.entityCounts.locations / topic.minEntities.locations);
  }

  const progress = Math.min(1, Math.min(atomProgress, entryProgress, entityProgress));
  const level = levelFromProgress(progress);

  return {
    topic,
    level,
    progress,
    atomCount,
    entryCount,
    atomsNeeded: Math.max(0, topic.minAtoms - atomCount),
    entriesNeeded: Math.max(0, topic.minEntries - entryCount),
    canGenerate: progress >= 1,
  };
}

export function computeLoreReadiness(stats: ContentStatsSnapshot): LoreReadinessSummary {
  const topics = LORE_TOPICS.map((t) => computeTopicReadiness(t, stats));
  const overallProgress = Math.min(1, stats.totalNarrativeAtoms / MIN_ATOMS_ANY_BOOK);
  const readyTopicCount = topics.filter((t) => t.level === 'ready').length;
  const buildingTopicCount = topics.filter((t) => t.level === 'building').length;

  const knowledgeScore = Math.round(
    overallProgress * 40 +
      readyTopicCount * 5 +
      buildingTopicCount * 2 +
      Math.min(stats.entityCounts.characters, 10) +
      Math.min(stats.entityCounts.locations, 5)
  );

  return {
    stats,
    overallProgress,
    overallLevel: levelFromProgress(overallProgress),
    canGenerateAnyBook: stats.totalNarrativeAtoms >= MIN_ATOMS_ANY_BOOK,
    topics,
    readyTopicCount,
    buildingTopicCount,
    knowledgeScore,
  };
}

export const READINESS_LABELS: Record<LoreReadinessLevel, string> = {
  needs_more: 'Not enough knowledge',
  building: 'Building knowledge',
  ready: 'Ready to compile',
};

export const READINESS_COLORS: Record<LoreReadinessLevel, string> = {
  needs_more: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  building: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
  ready: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
};

export const EMPTY_CONTENT_STATS: ContentStatsSnapshot = {
  totalJournalEntries: 0,
  totalChatMessages: 0,
  totalNarrativeAtoms: 0,
  totalWordCount: 0,
  domainCoverage: [],
  entityCounts: { characters: 0, locations: 0, events: 0, skills: 0 },
};

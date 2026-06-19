import type { ContentStatsSnapshot } from '../lib/loreReadiness';

/** Zero knowledge — all topics locked, editor locked. */
export const MOCK_CONTENT_STATS_EMPTY: ContentStatsSnapshot = {
  totalJournalEntries: 0,
  totalChatMessages: 0,
  totalNarrativeAtoms: 0,
  totalWordCount: 0,
  domainCoverage: [],
  entityCounts: { characters: 0, locations: 0, events: 0, skills: 0 },
};

/** Sparse account — most topics locked, simulates early user. */
export const MOCK_CONTENT_STATS_SPARSE: ContentStatsSnapshot = {
  totalJournalEntries: 4,
  totalChatMessages: 28,
  totalNarrativeAtoms: 7,
  totalWordCount: 2400,
  domainCoverage: [
    { domain: 'personal', atomCount: 3, entryCount: 2 },
    { domain: 'professional', atomCount: 2, entryCount: 1 },
  ],
  entityCounts: { characters: 1, locations: 1, events: 2, skills: 0 },
};

/** Mid collection — some domains building, few ready. */
export const MOCK_CONTENT_STATS_BUILDING: ContentStatsSnapshot = {
  totalJournalEntries: 18,
  totalChatMessages: 142,
  totalNarrativeAtoms: 14,
  totalWordCount: 12400,
  domainCoverage: [
    { domain: 'professional', atomCount: 9, entryCount: 6 },
    { domain: 'relationships', atomCount: 5, entryCount: 3 },
    { domain: 'family', atomCount: 4, entryCount: 3 },
    { domain: 'personal', atomCount: 6, entryCount: 5 },
  ],
  entityCounts: { characters: 4, locations: 3, events: 8, skills: 2 },
};

/** Rich mock — multiple topics ready to compile. */
export const MOCK_CONTENT_STATS_RICH: ContentStatsSnapshot = {
  totalJournalEntries: 48,
  totalChatMessages: 320,
  totalNarrativeAtoms: 62,
  totalWordCount: 58000,
  domainCoverage: [
    { domain: 'professional', atomCount: 18, entryCount: 12 },
    { domain: 'relationships', atomCount: 14, entryCount: 9 },
    { domain: 'family', atomCount: 10, entryCount: 7 },
    { domain: 'creative', atomCount: 8, entryCount: 5 },
    { domain: 'personal', atomCount: 12, entryCount: 8 },
    { domain: 'education', atomCount: 6, entryCount: 4 },
    { domain: 'health', atomCount: 5, entryCount: 3 },
  ],
  entityCounts: { characters: 12, locations: 8, events: 24, skills: 6 },
};

export type LoreReadinessKnowledgePreset = 'empty' | 'sparse' | 'building' | 'rich';

export type LoreReadinessCompiledMode = 'none' | 'one' | 'two';

export const LORE_READINESS_PRESET_OPTIONS: Array<{
  id: LoreReadinessKnowledgePreset;
  label: string;
  description: string;
  overallLevel: 'needs_more' | 'building' | 'ready';
}> = [
  { id: 'empty', label: 'Empty', description: 'No chats processed yet', overallLevel: 'needs_more' },
  { id: 'sparse', label: 'Sparse', description: '2 Story Forge chats', overallLevel: 'needs_more' },
  { id: 'building', label: 'Building', description: '5 chats → growing memory', overallLevel: 'building' },
  { id: 'rich', label: 'Rich', description: 'All chats → ready to compile', overallLevel: 'ready' },
];

export const LORE_READINESS_COMPILED_OPTIONS: Array<{
  id: LoreReadinessCompiledMode;
  label: string;
  description: string;
}> = [
  { id: 'none', label: 'No books', description: 'Editor locked' },
  { id: 'one', label: '1 compiled', description: 'Editor unlocks for one book' },
  { id: 'two', label: '2 compiled', description: 'Multiple books in library' },
];

export function getMockContentStats(preset: LoreReadinessKnowledgePreset): ContentStatsSnapshot {
  switch (preset) {
    case 'empty':
      return MOCK_CONTENT_STATS_EMPTY;
    case 'sparse':
      return MOCK_CONTENT_STATS_SPARSE;
    case 'building':
      return MOCK_CONTENT_STATS_BUILDING;
    default:
      return MOCK_CONTENT_STATS_RICH;
  }
}

export type MockCompiledBook = {
  id: string;
  title: string;
  lorebook_name?: string;
  created_at: string;
  chapterCount?: number;
};

const MOCK_BOOK_CATALOG: MockCompiledBook[] = [
  {
    id: 'demo-1',
    title: 'The Keeper of Marrowvale',
    lorebook_name: 'Core lorebook',
    created_at: new Date().toISOString(),
    chapterCount: 6,
  },
  {
    id: 'demo-2',
    title: 'Mira Solenne',
    lorebook_name: 'Relationships',
    created_at: new Date().toISOString(),
    chapterCount: 4,
  },
];

export function getMockCompiledBooks(mode: LoreReadinessCompiledMode): MockCompiledBook[] {
  if (mode === 'none') return [];
  if (mode === 'one') return MOCK_BOOK_CATALOG.slice(0, 1);
  return MOCK_BOOK_CATALOG;
}

/** @deprecated use LoreReadinessKnowledgePreset */
export type MockReadinessPreset = Exclude<LoreReadinessKnowledgePreset, 'empty'>;

import type { ContentStatsSnapshot } from '../lib/loreReadiness';

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

/** Mid collection — some domains building, one ready. */
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

/** Rich mock — multiple books can be compiled (demo / showcase). */
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

export type MockReadinessPreset = 'sparse' | 'building' | 'rich';

export function getMockContentStats(preset: MockReadinessPreset = 'rich'): ContentStatsSnapshot {
  switch (preset) {
    case 'sparse':
      return MOCK_CONTENT_STATS_SPARSE;
    case 'building':
      return MOCK_CONTENT_STATS_BUILDING;
    default:
      return MOCK_CONTENT_STATS_RICH;
  }
}

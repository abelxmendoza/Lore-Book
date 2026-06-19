import type { ContentStatsSnapshot } from '../loreReadiness';
import type { StoryDomain, StoryMemoryState } from './types';

/** Map Story Forge domains → lore readiness domain labels. */
const STORY_TO_LORE_DOMAIN: Record<StoryDomain, string> = {
  romance: 'relationships',
  relationships: 'relationships',
  family: 'family',
  career: 'professional',
  health: 'health',
  creative: 'creative',
  social: 'relationships',
  place: 'personal',
  identity: 'personal',
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Convert Story Forge memory graph into lore readiness stats (demo + future server bridge). */
export function memoryToContentStats(memory: StoryMemoryState): ContentStatsSnapshot {
  const domainMap = new Map<string, { atomCount: number; entryCount: number }>();

  for (const atom of memory.atoms) {
    for (const domain of atom.domains) {
      const loreDomain = STORY_TO_LORE_DOMAIN[domain];
      const row = domainMap.get(loreDomain) ?? { atomCount: 0, entryCount: 0 };
      row.atomCount += 1;
      row.entryCount += atom.type === 'event' || atom.type === 'turning_point' ? 1 : 0;
      domainMap.set(loreDomain, row);
    }
  }

  // User turns count as journal-like entries when no explicit event atom
  const userTurns = Math.max(0, Math.floor(memory.turnsProcessed / 2));
  for (const [domain, row] of domainMap.entries()) {
    if (row.entryCount === 0 && row.atomCount > 0) {
      row.entryCount = Math.max(1, Math.ceil(row.atomCount / 2));
      domainMap.set(domain, row);
    }
  }

  const entities = Object.values(memory.entities);
  const characters = entities.filter((e) => e.type === 'character').length;
  const locations = entities.filter((e) => e.type === 'location').length;
  const skills = entities.filter((e) => e.type === 'skill').length;
  const events = memory.situations.length;

  const totalWordCount = memory.atoms.reduce((sum, atom) => sum + countWords(atom.content), 0);

  return {
    totalJournalEntries: userTurns,
    totalChatMessages: memory.turnsProcessed,
    totalNarrativeAtoms: memory.atoms.length,
    totalWordCount,
    domainCoverage: [...domainMap.entries()].map(([domain, counts]) => ({
      domain,
      atomCount: counts.atomCount,
      entryCount: counts.entryCount,
    })),
    entityCounts: { characters, locations, events, skills },
  };
}

import type { ContentStatsSnapshot } from '../loreReadiness';
import { EMPTY_CONTENT_STATS } from '../loreReadiness';
import type { LoreReadinessCompiledMode, LoreReadinessKnowledgePreset } from '../../mocks/loreReadiness';
import type { MockCompiledBook } from '../../mocks/loreReadiness';
import { CONVERSATION_SCENARIOS } from './conversationScenarios';
import { memoryToContentStats } from './memoryToContentStats';
import { runStoryForgeBatch } from './storyForgeEngine';
import type { CompiledBookDraft, StoryMemoryState } from './types';

const PRESET_SCENARIO_COUNTS: Record<LoreReadinessKnowledgePreset, number> = {
  empty: 0,
  sparse: 2,
  building: 5,
  rich: CONVERSATION_SCENARIOS.length,
};

export type ForgeReadinessSnapshot = {
  stats: ContentStatsSnapshot;
  memory: StoryMemoryState | null;
  mainBook: CompiledBookDraft | null;
  domainBooks: CompiledBookDraft[];
};

export function runForgeForPreset(preset: LoreReadinessKnowledgePreset): ForgeReadinessSnapshot {
  const count = PRESET_SCENARIO_COUNTS[preset];
  if (count === 0) {
    return { stats: EMPTY_CONTENT_STATS, memory: null, mainBook: null, domainBooks: [] };
  }

  const scenarioIds = CONVERSATION_SCENARIOS.slice(0, count).map((s) => s.id);
  const batch = runStoryForgeBatch(scenarioIds);
  const domainBooks = batch.mainBook.chapters.length > 1
    ? batch.mainBook.chapters.slice(0, 3).map((ch) => ({
        id: `forge-${ch.id}`,
        title: ch.title,
        subtitle: ch.summary,
        chapters: [ch],
        versions: batch.mainBook.versions,
        latestVersion: batch.mainBook.latestVersion,
      }))
    : [];

  return {
    stats: memoryToContentStats(batch.combinedMemory),
    memory: batch.combinedMemory,
    mainBook: batch.mainBook,
    domainBooks,
  };
}

export function forgeCompiledBooks(
  mode: LoreReadinessCompiledMode,
  forge: ForgeReadinessSnapshot
): MockCompiledBook[] {
  if (mode === 'none' || !forge.mainBook) return [];

  const main: MockCompiledBook = {
    id: forge.mainBook.id,
    title: forge.mainBook.title,
    lorebook_name: 'From your chats',
    created_at: forge.mainBook.latestVersion.compiledAt,
    chapterCount: forge.mainBook.chapters.length,
  };

  if (mode === 'one') return [main];

  const extras = forge.domainBooks.slice(0, 1).map((book) => ({
    id: book.id,
    title: book.title,
    lorebook_name: book.subtitle,
    created_at: book.latestVersion.compiledAt,
    chapterCount: book.chapters.length,
  }));

  return [main, ...extras];
}

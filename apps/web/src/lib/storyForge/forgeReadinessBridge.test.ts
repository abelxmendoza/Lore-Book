import { describe, it, expect } from 'vitest';

import { CONVERSATION_SCENARIOS } from './conversationScenarios';
import { forgeCompiledBooks, runForgeForPreset } from './forgeReadinessBridge';
import { memoryToContentStats } from './memoryToContentStats';
import { scenarioToDemoThread, scenariosToDemoThreads } from './scenarioToDemoThread';
import { runStoryForgeBatch } from './storyForgeEngine';

describe('memoryToContentStats', () => {
  it('maps forge memory into lore readiness stats', () => {
    const batch = runStoryForgeBatch(['weekend-presence', 'career-connector']);
    const stats = memoryToContentStats(batch.combinedMemory);

    expect(stats.totalNarrativeAtoms).toBeGreaterThan(0);
    expect(stats.totalChatMessages).toBe(6);
    expect(stats.entityCounts.characters).toBeGreaterThan(0);
    expect(stats.domainCoverage.some((d) => d.domain === 'relationships' || d.domain === 'professional')).toBe(
      true
    );
  });
});

describe('forgeReadinessBridge', () => {
  it('returns empty stats for empty preset', () => {
    const forge = runForgeForPreset('empty');
    expect(forge.stats.totalNarrativeAtoms).toBe(0);
    expect(forge.mainBook).toBeNull();
  });

  it('builds compiled books from forge output', () => {
    const forge = runForgeForPreset('building');
    const books = forgeCompiledBooks('two', forge);
    expect(books.length).toBeGreaterThanOrEqual(1);
    expect(books[0].title).toBeTruthy();
  });

  it('rich preset processes all scenarios', () => {
    const forge = runForgeForPreset('rich');
    expect(forge.stats.totalChatMessages).toBeGreaterThan(20);
    expect(forge.mainBook?.chapters.length).toBeGreaterThan(0);
  });
});

describe('scenarioToDemoThread', () => {
  it('creates chat threads with entity mentions', () => {
    const scenario = CONVERSATION_SCENARIOS[0];
    const thread = scenarioToDemoThread(scenario);

    expect(thread.id).toContain(scenario.id);
    expect(thread.messages.length).toBe(scenario.turns.length);
    expect(thread.messages.some((m) => m.mentionedEntities?.length)).toBe(true);
  });

  it('creates one thread per scenario', () => {
    const threads = scenariosToDemoThreads(CONVERSATION_SCENARIOS.slice(0, 3));
    expect(threads).toHaveLength(3);
    expect(new Set(threads.map((t) => t.id)).size).toBe(3);
  });
});

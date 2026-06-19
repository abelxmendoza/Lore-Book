import { describe, it, expect } from 'vitest';

import { compileBookFromMemory } from './bookCompilationSimulator';
import { CONVERSATION_SCENARIOS, getScenarioById } from './conversationScenarios';
import { StoryMemoryEngine } from './storyMemoryEngine';
import { runStoryForgeBatch, runStoryForgeScenario } from './storyForgeEngine';

describe('StoryMemoryEngine', () => {
  it('detects entities and accumulates memory across turns', () => {
    const scenario = getScenarioById('weekend-presence')!;
    const engine = new StoryMemoryEngine({ scenario });

    engine.processTurn('user', scenario.turns[0].content);
    const mid = engine.getState();
    expect(Object.keys(mid.entities).length).toBeGreaterThan(0);
    expect(mid.entities['demo-char-alex'] ?? Object.values(mid.entities).find((e) => e.name === 'Alex')).toBeTruthy();

    engine.processTurn('assistant', scenario.turns[1].content);
    engine.processTurn('user', scenario.turns[2].content);

    const state = engine.getState();
    expect(state.turnsProcessed).toBe(3);
    expect(state.atoms.length).toBe(3);
    expect(state.situations.some((s) => s.tag === 'weekend_trip')).toBe(true);
    expect(state.connections.length).toBeGreaterThan(0);
  });

  it('tags romantic partner when user explicitly says so', () => {
    const engine = new StoryMemoryEngine();
    engine.processTurn(
      'user',
      'I want LoreBook to remember Alex as my romantic partner, not just a name in chat.'
    );
    const alex = Object.values(engine.getState().entities).find((e) => e.name === 'Alex');
    expect(alex?.characterVariant).toBe('romantic');
  });
});

describe('bookCompilationSimulator', () => {
  it('produces versioned book drafts from memory', () => {
    const scenario = getScenarioById('career-connector')!;
    const engine = new StoryMemoryEngine({ scenario });
    for (const turn of scenario.turns) {
      engine.processTurn(turn.role, turn.content);
    }

    const book = compileBookFromMemory(engine.getState(), { title: scenario.title });
    expect(book.latestVersion.version).toBe(1);
    expect(book.latestVersion.entityCount).toBeGreaterThan(0);
    expect(book.chapters.length).toBeGreaterThan(0);
    expect(book.chapters.some((c) => c.domain === 'career')).toBe(true);

    const book2 = compileBookFromMemory(engine.getState(), {
      title: scenario.title,
      previousVersions: book.versions,
    });
    expect(book2.latestVersion.version).toBe(1);
    expect(book2.latestVersion.snapshotHash).toBe(book.latestVersion.snapshotHash);
  });
});

describe('storyForgeEngine orchestrator', () => {
  it('runs a single scenario end-to-end', () => {
    const result = runStoryForgeScenario('family-return');
    expect(result).not.toBeNull();
    expect(result!.analyses).toHaveLength(3);
    expect(result!.mainBook.chapters.length).toBeGreaterThan(0);
    expect(Object.values(result!.memory.entities).some((e) => e.name.includes('Maria') || e.name.includes('María'))).toBe(
      true
    );
  });

  it('batch run merges all scenarios into combined memory', () => {
    const batch = runStoryForgeBatch(['weekend-presence', 'crew-formation']);
    expect(batch.scenariosRun).toBe(2);
    expect(batch.combinedMemory.turnsProcessed).toBe(6);
    expect(batch.mainBook.latestVersion.sourceTurns).toBe(6);
    expect(batch.perScenario).toHaveLength(2);
  });

  it('exposes all conversation scenarios', () => {
    expect(CONVERSATION_SCENARIOS.length).toBeGreaterThanOrEqual(14);
  });
});

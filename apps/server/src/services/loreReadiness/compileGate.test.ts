import { describe, it, expect, vi } from 'vitest';
import { evaluationToQuestPrompts } from './compileGate';
import type { LoreReadinessSummary } from './types';
import { LORE_TOPICS } from './topics';

vi.mock('./loreReadinessService', () => ({
  loreReadinessService: {},
}));

function mockSummary(topics: LoreReadinessSummary['topics']): LoreReadinessSummary {
  return {
    stats: {
      totalJournalEntries: 0,
      totalChatMessages: 0,
      totalNarrativeAtoms: 10,
      totalWordCount: 0,
      domainCoverage: [],
      entityCounts: { characters: 0, locations: 0, events: 0, skills: 0 },
    },
    overallProgress: 0.5,
    overallLevel: 'building',
    canGenerateAnyBook: false,
    topics,
    readyTopicCount: 0,
    buildingTopicCount: topics.length,
    knowledgeScore: 50,
  };
}

describe('compileGate quests', () => {
  it('turns blocker gaps into chat quest prompts', () => {
    const professional = LORE_TOPICS.find((t) => t.id === 'professional')!;
    const quests = evaluationToQuestPrompts(
      mockSummary([
        {
          topic: professional,
          level: 'building',
          progress: 0.6,
          atomCount: 5,
          entryCount: 3,
          atomsNeeded: 3,
          entriesNeeded: 2,
          canGenerate: false,
          gaps: [
            {
              id: 'atoms',
              label: 'Narrative atoms',
              severity: 'blocker',
              current: 5,
              required: 8,
              suggestion: 'Share 3 more stories about career & work.',
            },
          ],
          dimensionScores: { volume: 0.6, diversity: 1, anchoring: 1, temporal: 1, evidence: 1 },
        },
      ])
    );

    expect(quests).toHaveLength(1);
    expect(quests[0].topicId).toBe('professional');
    expect(quests[0].prompt).toContain('career');
  });
});

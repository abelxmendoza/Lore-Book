import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkCompileGate, evaluationToQuestPrompts } from './compileGate';
import type { LoreReadinessEvaluation, LoreReadinessSummary } from './types';
import { LORE_TOPICS } from './topics';

const evaluateMock = vi.fn();

vi.mock('./loreReadinessService', () => ({
  loreReadinessService: {
    evaluate: (...args: unknown[]) => evaluateMock(...args),
  },
}));

function mockEval(partial: Partial<LoreReadinessEvaluation>): LoreReadinessEvaluation {
  return {
    label: 'Test',
    spec: {
      scope: 'domain',
      domain: 'professional',
      tone: 'neutral',
      depth: 'detailed',
      audience: 'self',
      includeIntrospection: true,
    },
    level: 'building',
    progress: 0.3,
    canGenerate: false,
    atomCount: 3,
    entryCount: 2,
    wordCount: 100,
    atomsNeeded: 5,
    entriesNeeded: 3,
    estimatedPages: 1,
    gaps: [],
    suggestions: ['Share more stories.'],
    dimensionScores: { volume: 0.3, diversity: 0.5, anchoring: 0.5, temporal: 0.5, evidence: 0.5 },
    ...partial,
  };
}

beforeEach(() => {
  evaluateMock.mockReset();
});

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

describe('checkCompileGate form tiers', () => {
  it('allows vignette when atom floor is met even if topic is not fully ready', async () => {
    evaluateMock.mockResolvedValue(
      mockEval({ atomCount: 2, progress: 0.2, canGenerate: false }),
    );
    const gate = await checkCompileGate('user-1', { form: 'vignette', topicId: 'professional' });
    expect(gate.allowed).toBe(true);
    expect(gate.mode).toBe('soft_blocked');
  });

  it('blocks full book when below readiness and atom floor', async () => {
    evaluateMock.mockResolvedValue(
      mockEval({ atomCount: 3, progress: 0.2, canGenerate: false }),
    );
    const gate = await checkCompileGate('user-1', { form: 'book', topicId: 'professional' });
    expect(gate.allowed).toBe(false);
    expect(gate.mode).toBe('hard_blocked');
  });

  it('allows chapter at 3 atoms', async () => {
    evaluateMock.mockResolvedValue(
      mockEval({ atomCount: 3, progress: 0.25, canGenerate: false }),
    );
    const gate = await checkCompileGate('user-1', { form: 'chapter', topicId: 'creative' });
    expect(gate.allowed).toBe(true);
  });
});

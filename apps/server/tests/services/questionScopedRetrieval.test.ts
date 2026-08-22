import { describe, expect, it } from 'vitest';
import { planResponseScope } from '../../src/services/responseScope';
import {
  isWorkingMemoryEvidenceSufficient,
  planQuestionScopedRetrieval,
} from '../../src/services/chat/questionScopedRetrieval';
import type { WorkingMemoryAssembly } from '../../src/services/chat/workingMemoryAssembler';

function assembly(overrides: Partial<WorkingMemoryAssembly> = {}): WorkingMemoryAssembly {
  return {
    intent: 'CAREER_QUERY',
    contextPlan: { version: 'context-assembly-v1', primary: 'career', secondary: [], excluded: [], ranked: [], reason: 'test', strictBoundary: true },
    contextDiagnostics: {
      candidatesConsidered: 1,
      accepted: 1,
      prunedForDrift: 0,
      coverageEstimate: 1,
      confidenceEstimate: 0.9,
      completenessEstimate: 1,
      newestEvidenceAt: null,
    },
    entities: [],
    episodes: [],
    events: [],
    projects: [],
    goals: [],
    skills: [],
    communities: [],
    relationships: [],
    preferences: [],
    claims: [],
    timeline: [],
    rejected: [],
    budget: { selected: 1, rejected: 0, maxItems: 12 },
    confidence: 0.8,
    ...overrides,
  } as WorkingMemoryAssembly;
}

describe('question-scoped retrieval plan', () => {
  it('keeps a simple Northwind work date question on the minimal packet', () => {
    const plan = planQuestionScopedRetrieval(
      'When did I work at Northwind?',
      planResponseScope('When did I work at Northwind?'),
    );
    expect(plan.breadth).toBe('minimal');
    expect(plan.loadRomance).toBe(false);
    expect(plan.loadSkillsIndex).toBe(false);
    expect(plan.loadTimelineHierarchy).toBe(false);
    expect(plan.loadSocialCommunities).toBe(false);
    expect(plan.earlyStopOnWmaEvidence).toBe(true);
    expect(plan.primaryEntityNames.some((name) => /northwind/i.test(name))).toBe(true);
  });

  it('does not early-stop a reflective question', () => {
    const message = 'Looking back, how am I doing with all of this?';
    const plan = planQuestionScopedRetrieval(message, planResponseScope(message));
    expect(plan.breadth).toBe('full');
    expect(plan.earlyStopOnWmaEvidence).toBe(false);
    expect(plan.loadRomance || plan.loadTimelineHierarchy || plan.loadCharacters).toBe(true);
  });

  it('treats grounded career evidence as sufficient to stop', () => {
    const message = 'When did I start at Northwind?';
    const plan = planQuestionScopedRetrieval(message, planResponseScope(message));
    expect(
      isWorkingMemoryEvidenceSufficient(
        assembly({
          events: [{
            id: 'event:northwind-start',
            type: 'event',
            title: 'Started at Northwind',
            content: 'Joined Northwind in 2019.',
            source: 'resolved_events',
            confidence: 0.9,
            score: 0.9,
            reasons: ['canonical'],
          }],
        }),
        plan,
      ),
    ).toBe(true);
  });

  it('does not treat empty working memory as sufficient', () => {
    const message = 'When did I work at Northwind?';
    const plan = planQuestionScopedRetrieval(message, planResponseScope(message));
    expect(
      isWorkingMemoryEvidenceSufficient(
        assembly({ budget: { selected: 0, rejected: 0, maxItems: 12 }, confidence: 0.2, events: [] }),
        plan,
      ),
    ).toBe(false);
  });
});

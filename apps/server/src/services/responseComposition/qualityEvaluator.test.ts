import { describe, expect, it } from 'vitest';

import { evaluateComposition } from './qualityEvaluator';
import type { CompositionPlan } from './types';

const plan = (overrides: Partial<CompositionPlan> = {}): CompositionPlan => ({
  version: 'composition-plan-v1',
  profile: 'recall',
  primaryGoal: 'Answer the question.',
  supportingGoal: 'Stay grounded.',
  evidencePriority: ['direct_answer'],
  narrativeStrategy: 'answer_then_support',
  ordering: ['direct_answer', 'primary_evidence', 'follow_up'],
  compressionBudget: 6,
  reflectionBudget: 0,
  followUpStrategy: 'ask_for_missing_detail',
  selectedEvidenceIds: ['evidence-1'],
  discardedEvidenceIds: [],
  rationale: 'synthetic',
  ...overrides,
});

describe('evaluateComposition', () => {
  it('passes a concise grounded answer with one optional follow-up', () => {
    const result = evaluateComposition({
      userMessage: 'What work have I done?',
      response: 'You worked in hardware validation and field robotics.\n\nWould you like the dates too?',
      plan: plan(),
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.followUpCount).toBe(1);
  });

  it('flags visible retrieval mechanics and repeated content', () => {
    const result = evaluateComposition({
      userMessage: 'Tell me about my work.',
      response: 'Source ID: abc.\nSource ID: abc.',
      plan: plan(),
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'internal identifier',
      'repeated_content',
    ]));
    expect(result.recompositionRecommended).toBe(true);
  });

  it('allows diagnostic vocabulary for the debug profile', () => {
    const result = evaluateComposition({
      userMessage: 'Why did LoreBook answer this way?',
      response: 'The retrieval diagnostic shows the source ID was excluded.',
      plan: plan({ profile: 'debug' }),
    });

    expect(result.scores.databaseLeakage).toBe(1);
  });

  it('flags multiple follow-up questions', () => {
    const result = evaluateComposition({
      userMessage: 'What changed?',
      response: 'Your work changed over time. What period should I focus on? Should I compare it with school?',
      plan: plan({ profile: 'reflection', reflectionBudget: 5 }),
    });

    expect(result.followUpCount).toBe(2);
    expect(result.reasons).toContain('more_than_one_follow_up_question');
  });
});

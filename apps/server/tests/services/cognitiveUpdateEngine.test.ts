import { describe, expect, it } from 'vitest';

import {
  evaluateCognitiveUpdate,
  planProjectionImpacts,
  type CognitiveEvidenceInput,
} from '../../src/services/cognitiveUpdate';

function evidence(content: string, overrides: Partial<CognitiveEvidenceInput> = {}): CognitiveEvidenceInput {
  return {
    evidenceId: 'message-1',
    userId: 'synthetic-user',
    content,
    source: 'chat_message',
    authorRole: 'user',
    recordedAt: '2026-08-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('Cognitive Update Engine', () => {
  it('returns no change for ordinary conversation', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: evidence('I had coffee and the weather was nice.'),
      now: '2026-08-09T12:01:00.000Z',
    });

    expect(diff.changed).toBe(false);
    expect(diff.changes).toEqual([]);
    expect(diff.impacts).toEqual([]);
    expect(diff.noChangeReason).toMatch(/No explicit/i);
  });

  it('plans a bounded career update when a user accepts a job', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: evidence('I accepted the robotics job.'),
      previousState: {
        revision: 'state-7',
        currentChapter: { id: 'chapter-search', domain: 'career', status: 'career_search_transition' },
        activeGoals: [{ id: 'goal-job', title: 'Find a robotics job', status: 'ACTIVE' }],
      },
      now: '2026-08-09T12:01:00.000Z',
    });

    expect(diff.changes.map((change) => change.type)).toEqual(expect.arrayContaining([
      'CAREER_MILESTONE',
      'CHAPTER_STARTED',
      'CHAPTER_ENDED',
      'IDENTITY_STRENGTHENED',
      'GOAL_COMPLETED',
    ]));
    expect(diff.impacts.map((impact) => impact.projection)).toEqual(expect.arrayContaining([
      'canonical_timeline',
      'narrative_ir',
      'identity_snapshot',
      'context_plan_cache',
      'quest_projection',
    ]));
    expect(diff.impacts.every((impact) => impact.action !== 'FULL_REGENERATION')).toBe(true);
  });

  it('requires review for relationship-state changes', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: evidence('We broke up and are no longer together.'),
      now: '2026-08-09T12:01:00.000Z',
    });

    expect(diff.requiresReview).toBe(true);
    expect(diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'RELATIONSHIP_CHANGED', status: 'REVIEW_REQUIRED' }),
    ]));
    expect(diff.impacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ projection: 'relationship_projection', action: 'REVIEW_REQUIRED' }),
    ]));
  });

  it('distinguishes goal abandonment from ordinary goal language', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: evidence('I no longer want to finish that certification goal. I abandoned it.'),
      now: '2026-08-09T12:01:00.000Z',
    });

    expect(diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'GOAL_ABANDONED' }),
    ]));
    expect(diff.impacts.map((impact) => impact.projection)).toEqual(expect.arrayContaining([
      'goal_projection',
      'quest_projection',
    ]));
  });

  it('never lets assistant prose update autobiographical projections', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: evidence('You accepted the robotics job.', { authorRole: 'assistant' }),
      now: '2026-08-09T12:01:00.000Z',
    });

    expect(diff.changed).toBe(false);
    expect(diff.invariants).toEqual({ rawEvidenceMutated: false, canonicalStateMutated: false });
  });

  it('defers non-critical projection work for large imports', () => {
    const impacts = planProjectionImpacts([
      { type: 'PROJECT_COMPLETED', summary: 'Project completion was reported.' },
    ], { batchSize: 250 });

    expect(impacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ projection: 'canonical_timeline', priority: 'HIGH' }),
      expect.objectContaining({ projection: 'identity_snapshot', priority: 'DEFERRED' }),
    ]));
  });

  it('is reproducible for the same evidence and state revision', () => {
    const input = {
      evidence: evidence('I released the first version of MemoVault.'),
      previousState: { revision: 'state-2' },
      now: '2026-08-09T12:01:00.000Z',
    } as const;
    const first = evaluateCognitiveUpdate(input);
    const second = evaluateCognitiveUpdate(input);

    expect(second).toEqual(first);
  });

  it('detects living-state transitions instead of only summarizing the message', () => {
    const diff = evaluateCognitiveUpdate({
      evidence: evidence('LegacyRobot is not an active project. I have not worked on it since March. Right now I am mainly focused on MemoVault, music, fitness, and getting a new job. I was detained by police.'),
      now: '2026-08-09T12:01:00.000Z',
    });

    expect(diff.changes.map((change) => change.type)).toEqual(expect.arrayContaining([
      'PROJECT_STATUS_CHANGED',
      'CURRENT_FOCUS_CHANGED',
      'LIFE_EVENT_DETECTED',
    ]));
    expect(diff.impacts.map((impact) => impact.projection)).toEqual(expect.arrayContaining([
      'project_projection',
      'canonical_timeline',
      'identity_snapshot',
      'context_plan_cache',
    ]));
  });
});

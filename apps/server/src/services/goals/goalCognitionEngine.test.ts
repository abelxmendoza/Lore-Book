import { describe, expect, it } from 'vitest';
import { goalCognitionEngine } from './goalCognitionEngine';
import { GoalExtractor } from './goalExtractor';
import { goalInactivityAdjustment, shouldAbandonFromSilence } from './goalInactivityPolicy';
import { GoalStateCalculator } from './goalStateCalculator';

function evaluate(sourceText: string, proposedTitle?: string) {
  return goalCognitionEngine.evaluate({
    ownerEntityId: 'synthetic-user',
    sourceText,
    proposedTitle,
    sourceMessageId: 'synthetic-message',
    sourceType: 'chat',
    authorRole: 'user',
    now: new Date('2026-07-23T12:00:00Z'),
  });
}

describe('Goal Cognition Engine', () => {
  it.each([
    ['you completely failed', 'NON_GOAL'],
    ['Next', 'NON_GOAL'],
    ['that was a failed response', 'NON_GOAL'],
  ])('rejects fragments and feedback: %s', (text, kind) => {
    const result = evaluate(text);
    expect(result.candidate.kind).toBe(kind);
    expect(result.decision).toBe('REJECT');
  });

  it('classifies completed actions without suggesting an active goal', () => {
    const result = evaluate('I ran yesterday.', 'Run yesterday');
    expect(result.candidate.kind).toBe('COMPLETED_ACTION');
    expect(result.candidate.temporalState).toBe('PAST_COMPLETED');
    expect(result.decision).toBe('COMPLETE_EXISTING');
    expect(result.eligibility.eligible).toBe(false);
  });

  it('accepts a future user-authored run as a task', () => {
    const result = evaluate(
      "I'm going to run at Mile Square Park today.",
      'Run at Mile Square Park today',
    );
    expect(result.candidate.kind).toBe('TASK');
    expect(result.candidate.temporalState).toBe('FUTURE_PLANNED');
    expect(['ACCEPT', 'REVIEW']).toContain(result.decision);
    expect(result.eligibility.eligible).toBe(true);
  });

  it('rejects passive verb phrases', () => {
    const result = evaluate('The program is run by Rafeh Qazi.', 'Run by Rafeh Qazi');
    expect(result.candidate.kind).toBe('NON_GOAL');
    expect(result.decision).toBe('REJECT');
  });

  it('preserves avoidance polarity', () => {
    const result = evaluate(
      "I don't want to end up in the media.",
      'End up in the media',
    );
    expect(result.candidate.kind).toBe('AVOIDANCE_GOAL');
    expect(result.candidate.canonicalTitle).not.toBe('End up in the media');
    expect(result.decision).toBe('REJECT');
  });

  it('understands nested negation as continuation', () => {
    const result = evaluate(
      "I don't want to stop building my side project.",
      "I don't want to stop building my side project",
    );
    expect(result.candidate.kind).toBe('PROJECT');
    expect(result.candidate.canonicalTitle).toBe('Continue building my side project');
    expect(result.eligibility.notNegated).toBe(true);
  });

  it('does not turn historical relationship intent into a current quest', () => {
    const result = evaluate(
      'At the time, I wanted to keep seeing Ashley.',
      'Keep seeing Ashley',
    );
    expect(result.candidate.kind).toBe('PAST_EVENT');
    expect(result.eligibility.eligible).toBe(false);
  });

  it('keeps current project intent active', () => {
    const result = evaluate('I still want to launch LoreBook.', 'Launch LoreBook');
    expect(result.candidate.kind).toBe('PROJECT');
    expect(result.candidate.temporalState).toBe('ONGOING');
    expect(result.eligibility.eligible).toBe(true);
  });

  it('does not classify an emotional state as a quest', () => {
    expect(evaluate('I miss Sol.').candidate.kind).toBe('NON_GOAL');
  });

  it('routes a third-party assignment to obligation, not quest', () => {
    const result = evaluate(
      'Jesse told me to test four Ring devices.',
      'Test four Ring devices',
    );
    expect(result.candidate.kind).toBe('OBLIGATION');
    expect(result.decision).toBe('REJECT');
  });

  it('assistant text cannot establish intent', () => {
    const result = goalCognitionEngine.evaluate({
      ownerEntityId: 'synthetic-user',
      sourceText: 'Would you like to reconnect with Jamie?',
      proposedTitle: 'Reconnect with Jamie',
      sourceType: 'assistant',
      authorRole: 'assistant',
    });
    expect(result.eligibility.sourceAllowed).toBe(false);
    expect(result.decision).toBe('REJECT');
  });

  it('silence never abandons a goal and outages or work reduce decay', () => {
    expect(shouldAbandonFromSilence()).toBe(false);
    expect(goalInactivityAdjustment({ silentDays: 14, appOutageDays: 14 })).toBe(0);
    expect(goalInactivityAdjustment({ silentDays: 14, workIntensity: 'HIGH' }))
      .toBeGreaterThan(goalInactivityAdjustment({ silentDays: 14, workIntensity: 'NORMAL' }));
  });

  it('gates the legacy goal extractor with cognition', () => {
    const goals = new GoalExtractor().extract({
      entries: [
        {
          id: 'past-entry',
          user_id: 'synthetic-user',
          content: 'I ran yesterday.',
          date: '2026-07-22T12:00:00Z',
        },
        {
          id: 'active-entry',
          user_id: 'synthetic-user',
          content: 'I still want to launch LoreBook.',
          date: '2026-07-23T12:00:00Z',
        },
      ],
    });
    expect(goals).toHaveLength(1);
    expect(goals[0].title).toBe('Launch LoreBook');
  });

  it('does not change lifecycle state from silence alone', () => {
    const goal = {
      id: 'synthetic-goal',
      title: 'Launch MemoVault',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      status: 'active' as const,
    };
    const insights = new GoalStateCalculator().calculate([goal], {});
    expect(goal.status).toBe('active');
    expect(insights[0]?.type).toBe('stagnation');
    expect(insights[0]?.confidence).toBeLessThan(0.5);
  });
});

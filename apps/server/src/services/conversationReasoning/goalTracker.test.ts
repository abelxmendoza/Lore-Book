import { describe, it, expect } from 'vitest';
import { resolveConversationGoal } from './goalTracker';
import type { ConversationGoalState } from './goalTrackerTypes';

function reflecting(): ConversationGoalState {
  return {
    goal: 'reflecting_on_life',
    setAt: new Date().toISOString(),
    setFromMessage: 'I keep thinking about who I used to be back then.',
    turnsSinceSet: 2,
    confidence: 0.75,
  };
}

describe('resolveConversationGoal', () => {
  it('does not switch goal when a new proper noun appears without a goal-shaped signal', () => {
    const r = resolveConversationGoal({
      message: 'Actually, my coworker Diego just texted me.',
      current: reflecting(),
      isCorrection: false,
      isRetry: false,
    });
    expect(r.changed).toBe(false);
    expect(r.next.goal).toBe('reflecting_on_life');
  });

  it('switches goal on an explicit, strong planning signal', () => {
    const r = resolveConversationGoal({
      message: "Let's actually plan out my next three months.",
      current: null,
      isCorrection: false,
      isRetry: false,
    });
    expect(r.changed).toBe(true);
    expect(r.next.goal).toBe('planning');
  });

  it('a correction message does not overwrite an established goal', () => {
    const r = resolveConversationGoal({
      message: "That's wrong, you forgot Wren.",
      current: reflecting(),
      isCorrection: true,
      isRetry: false,
    });
    expect(r.changed).toBe(false);
    expect(r.next.goal).toBe('reflecting_on_life');
  });

  it('a retry holds the current goal without reclassifying', () => {
    const r = resolveConversationGoal({
      message: 'try again',
      current: reflecting(),
      isCorrection: false,
      isRetry: true,
    });
    expect(r.changed).toBe(false);
    expect(r.next.goal).toBe('reflecting_on_life');
  });

  it('defaults to general with no prior goal and no signal', () => {
    const r = resolveConversationGoal({
      message: 'hey',
      current: null,
      isCorrection: false,
      isRetry: false,
    });
    expect(r.changed).toBe(true);
    expect(r.next.goal).toBe('general');
  });
});

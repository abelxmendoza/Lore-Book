import { describe, it, expect } from 'vitest';
import { evaluateConversationTierGate } from './memoryTierGate';
import type { ActiveConversationContext } from '../responseScope/responseScopeTypes';

function liveContext(overrides: Partial<ActiveConversationContext> = {}): ActiveConversationContext {
  return { intent: 'general', entities: [{ name: 'Wren' }], userTurnsSinceAnchor: 1, ...overrides };
}

const RECENT_HISTORY = [
  { role: 'user', content: 'Tell me about my friend Wren.' },
  { role: 'assistant', content: 'Wren is your best friend. She is 29 years old and lives in Austin.' },
];

describe('evaluateConversationTierGate', () => {
  it('short-circuits a genuine in-conversation follow-up', () => {
    const r = evaluateConversationTierGate({
      message: 'How old is she?',
      activeContext: liveContext(),
      conversationHistory: RECENT_HISTORY,
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.overlap).toBeGreaterThan(0);
  });

  it('never short-circuits with a stale/absent active context', () => {
    const r = evaluateConversationTierGate({
      message: 'How old is she?',
      activeContext: liveContext({ userTurnsSinceAnchor: 6 }),
      conversationHistory: RECENT_HISTORY,
    });
    expect(r.shortCircuit).toBe(false);
    expect(r.reason).toBe('active_context_stale_or_absent');
  });

  it('never short-circuits a standalone, self-contained question even with fabricated overlap', () => {
    const r = evaluateConversationTierGate({
      message: 'What is my job like these days?',
      activeContext: liveContext(),
      conversationHistory: [{ role: 'assistant', content: 'Your job these days sounds demanding.' }],
    });
    expect(r.shortCircuit).toBe(false);
    expect(r.reason).toBe('not_follow_up_shaped');
  });

  it('falls through when recent history shares no vocabulary with the message', () => {
    const r = evaluateConversationTierGate({
      message: 'How old is she?',
      activeContext: liveContext(),
      conversationHistory: [{ role: 'assistant', content: 'We discussed groceries and weekend plans.' }],
    });
    expect(r.shortCircuit).toBe(false);
    expect(r.reason).toBe('overlap_below_floor');
  });

  it('falls through with no recent history to compare against', () => {
    const r = evaluateConversationTierGate({
      message: 'How old is she?',
      activeContext: liveContext(),
      conversationHistory: [],
    });
    expect(r.shortCircuit).toBe(false);
    expect(r.reason).toBe('no_recent_history');
  });
});

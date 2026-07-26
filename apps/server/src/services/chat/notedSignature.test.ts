import { describe, it, expect } from 'vitest';
import {
  isEligibleForNotedLeadIn,
  isEligibleForNotedSignature,
  maybeNotedSignatureResponse,
  NOTED_SIGNATURE,
  shouldShowNotedLeadIn,
  shouldUseNotedSignature,
  stripLeadingNotedPrefix,
  turnsSinceLastNotedSignature,
} from './notedSignature';

describe('notedSignature', () => {
  it('is eligible for explicit log commands', () => {
    expect(isEligibleForNotedSignature({ message: 'Log this: Abel entered the lab.' })).toBe(true);
  });

  it('is not eligible for questions or emotional shares', () => {
    expect(isEligibleForNotedSignature({ message: 'What did I write in chapter 3?' })).toBe(false);
    expect(isEligibleForNotedSignature({ message: 'I feel overwhelmed today.' })).toBe(false);
  });

  it('respects cooldown since last Noted.', () => {
    const history = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: NOTED_SIGNATURE },
      { role: 'user' as const, content: 'Log this: test' },
    ];
    expect(turnsSinceLastNotedSignature(history)).toBe(1);
    expect(
      shouldUseNotedSignature({
        message: 'Log this: another note',
        conversationHistory: history,
        random: () => 0,
      }),
    ).toBe(false);
  });

  it('returns Noted. probabilistically when eligible', () => {
    expect(
      maybeNotedSignatureResponse({
        message: 'Memory: The villain fears abandonment.',
        random: () => 0.01,
      }),
    ).toBe(NOTED_SIGNATURE);

    expect(
      maybeNotedSignatureResponse({
        message: 'Memory: The villain fears abandonment.',
        random: () => 0.99,
      }),
    ).toBeNull();
  });

  it('is eligible for lead-in on short fact shares', () => {
    expect(isEligibleForNotedLeadIn({ message: "I'm working at Vanguard Robotics now." })).toBe(true);
    expect(isEligibleForNotedLeadIn({ message: 'What should I do next?' })).toBe(false);
  });

  it('shows lead-in probabilistically when eligible', () => {
    expect(
      shouldShowNotedLeadIn({
        message: "I'm working at Vanguard Robotics now.",
        random: () => 0.01,
      }),
    ).toBe(true);
    expect(
      shouldShowNotedLeadIn({
        message: "I'm working at Vanguard Robotics now.",
        random: () => 0.99,
      }),
    ).toBe(false);
  });

  it('strips a leading Noted. prefix for separate UI rendering', () => {
    expect(stripLeadingNotedPrefix('Noted. You work at Vanguard.')).toBe('You work at Vanguard.');
    expect(stripLeadingNotedPrefix('Hello there.')).toBe('Hello there.');
  });
});

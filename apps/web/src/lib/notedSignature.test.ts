import { describe, it, expect } from 'vitest';
import {
  isEligibleForNotedLeadIn,
  isEligibleForNotedSignature,
  maybeNotedSignatureResponse,
  NOTED_SIGNATURE,
  shouldShowNotedLeadIn,
} from './notedSignature';

describe('notedSignature (web)', () => {
  it('is eligible for explicit log commands', () => {
    expect(isEligibleForNotedSignature({ message: 'Log this: Abel entered the lab.' })).toBe(true);
  });

  it('returns Noted. when random hits on eligible message', () => {
    expect(
      maybeNotedSignatureResponse({
        message: 'Memory: The villain fears abandonment.',
        random: () => 0,
      }),
    ).toBe(NOTED_SIGNATURE);
  });

  it('does not treat creative discussion as a short memory deposit', () => {
    expect(isEligibleForNotedSignature({ message: 'I thought the villain needed more depth.' })).toBe(false);
  });

  it('supports occasional Noted. lead-in on fact shares', () => {
    expect(isEligibleForNotedLeadIn({ message: "I'm working at Vanguard Robotics now." })).toBe(true);
    expect(
      shouldShowNotedLeadIn({
        message: "I'm working at Vanguard Robotics now.",
        random: () => 0,
      }),
    ).toBe(true);
  });
});

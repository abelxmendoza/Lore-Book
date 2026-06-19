import { describe, it, expect } from 'vitest';
import {
  isEligibleForNotedSignature,
  maybeNotedSignatureResponse,
  NOTED_SIGNATURE,
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
});

import { describe, it, expect } from 'vitest';
import { shouldSwapForStrength, STRENGTH_SWAP_MARGIN } from './strengthWeightedMerge';

describe('shouldSwapForStrength', () => {
  it('swaps when the source clearly outscores the target (weak absorbing strong)', () => {
    expect(shouldSwapForStrength(90, 20)).toBe(true);
  });

  it('does not swap when the target is already the stronger survivor', () => {
    expect(shouldSwapForStrength(20, 90)).toBe(false);
  });

  it('does not swap for a sub-margin difference (keeps caller direction)', () => {
    expect(shouldSwapForStrength(50, 50 - (STRENGTH_SWAP_MARGIN - 1))).toBe(false);
  });

  it('swaps exactly at the margin boundary', () => {
    expect(shouldSwapForStrength(50, 50 - STRENGTH_SWAP_MARGIN)).toBe(true);
  });

  it('never swaps an identity-preserving merge (protagonist/self), even if source is stronger', () => {
    expect(shouldSwapForStrength(100, 0, { identityPreserved: true })).toBe(false);
  });

  it('degrades to no-swap when either score is unknown', () => {
    expect(shouldSwapForStrength(null, 10)).toBe(false);
    expect(shouldSwapForStrength(90, null)).toBe(false);
    expect(shouldSwapForStrength(null, null)).toBe(false);
  });

  it('honors a custom margin', () => {
    expect(shouldSwapForStrength(60, 50, { margin: 5 })).toBe(true);
    expect(shouldSwapForStrength(60, 50, { margin: 20 })).toBe(false);
  });
});

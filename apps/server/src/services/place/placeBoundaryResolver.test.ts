import { describe, expect, it } from 'vitest';

import { resolveCognitionPlaceBoundary } from './placeBoundaryResolver';

describe('resolveCognitionPlaceBoundary', () => {
  it('rejects multi-word narrative fragments containing a bare pronoun or narration verb', () => {
    // Real production suggestions: extraction over-captured plain narration
    // as a place-name span. Neither of these is a place.
    expect(resolveCognitionPlaceBoundary('V and Romi saw').clearBoundary).toBe(false);
    expect(resolveCognitionPlaceBoundary('Jordan she freaked out').clearBoundary).toBe(false);
  });

  it('does not reject legitimate multi-word venue and school names', () => {
    for (const name of [
      'Bad Dogg Compound',
      'Catch One',
      'Whittier Christian Middle School',
      'California State University, Fullerton',
      'Club Nova',
    ]) {
      expect(resolveCognitionPlaceBoundary(name).clearBoundary).toBe(true);
    }
  });

  it('does not reject short (1-2 word) spans even if they contain a pronoun-shaped token', () => {
    // The narrative-fragment guard is scoped to 3+ words specifically to avoid
    // false-rejecting short legitimate names like "She Shed".
    expect(resolveCognitionPlaceBoundary('She Shed').clearBoundary).toBe(true);
  });
});

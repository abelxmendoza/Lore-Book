import { describe, expect, it } from 'vitest';

import { isGenericPlaceNoun } from './placeCanonicalResolver';

describe('isGenericPlaceNoun', () => {
  it('flags bare generic nouns that should never resolve to a specific matched place on containment alone', () => {
    // Real production bug: "Club" (extraction confidence 68%) fuzzy-matched
    // as 'similar' to the existing place "Club Bar Sinister" purely because
    // "club" is a token-prefix of that name — regardless of whether the chat
    // actually referenced that specific venue.
    for (const name of ['club', 'Club', 'the club', 'bar', 'park', 'house']) {
      expect(isGenericPlaceNoun(name)).toBe(true);
    }
  });

  it('does not flag specific, non-generic place names', () => {
    for (const name of ['Club Bar Sinister', 'Bad Dogg Compound', 'Fullerton']) {
      expect(isGenericPlaceNoun(name)).toBe(false);
    }
  });
});

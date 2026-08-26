import { describe, expect, it } from 'vitest';

import { collectPlaceNamesFromIntelligence } from './episodeLexicalScanner';

describe('collectPlaceNamesFromIntelligence', () => {
  it('does not surface month names as place suggestions', () => {
    // Real production suggestion bug: "in June" matched the generic
    // preposition-based city pattern (place_city_in) with no month exclusion,
    // producing "June" as a Suggested Place at 68% confidence.
    const text =
      'yeah it was on No Kings day, Trumps birthday, I believe it was in June. ' +
      'I went to a ska show in my Black Angel jacket.';

    const names = collectPlaceNamesFromIntelligence(text).map((n) => n.toLowerCase());
    expect(names).not.toContain('june');
  });

  it('still surfaces a real city named after the same preposition pattern', () => {
    const text = 'We got dinner in Fullerton.';
    const names = collectPlaceNamesFromIntelligence(text).map((n) => n.toLowerCase());
    expect(names).toContain('fullerton');
  });
});

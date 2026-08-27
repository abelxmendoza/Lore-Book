import { describe, expect, it } from 'vitest';

import { collectPersonNamesFromIntelligence, collectPlaceNamesFromIntelligence } from './episodeLexicalScanner';

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

describe('collectPersonNamesFromIntelligence', () => {
  it('catches a name followed by an ordinary narrative verb ("and Name saw")', () => {
    // Real production gap: "V and Romi saw and heard when that happened"
    // produced zero person candidates — "person_coworker_and"'s lookahead
    // only accepted a closed set of continuations (,/./end/"I"/"at") and
    // "saw" wasn't one of them.
    const text = 'at V and Romi saw and heard when that happened';
    const names = collectPersonNamesFromIntelligence(text);
    expect(names).toContain('Romi');
  });

  it('catches a name introduced by a person-descriptor noun ("girl Name")', () => {
    const text = 'this little girl Olive who I met that day';
    const names = collectPersonNamesFromIntelligence(text);
    expect(names).toContain('Olive');
  });
});

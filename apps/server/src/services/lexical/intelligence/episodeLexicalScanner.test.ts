import { describe, expect, it } from 'vitest';

import { collectPersonNamesFromIntelligence } from './episodeLexicalScanner';

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

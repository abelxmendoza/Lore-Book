import { describe, expect, it } from 'vitest';

import { decomposePersonIntro } from './personIntroDecomposition';

describe('decomposePersonIntro (web)', () => {
  it('strips role contamination from introduce names', () => {
    const r = decomposePersonIntro("Jamie, Marcus's Social Worker, someone new in my life");
    expect(r.canonicalName).toBe('Jamie');
    expect(r.rolePhrase).toBe('social worker');
    expect(r.supportsAnchor).toBe('Marcus');
  });
});

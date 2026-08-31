import { describe, expect, it } from 'vitest';

import { isDiscourseOpener } from './discourseTokenGuard';

describe('discourseTokenGuard', () => {
  it('rejects capitalized sentence openers as person candidates', () => {
    for (const value of ["Here's", 'Here', "There's", 'Then', 'Also']) {
      expect(isDiscourseOpener(value)).toBe(true);
    }
  });

  it('keeps ordinary names eligible for downstream classification', () => {
    expect(isDiscourseOpener('Marcus')).toBe(false);
    expect(isDiscourseOpener('Jamie Lee')).toBe(false);
  });
});

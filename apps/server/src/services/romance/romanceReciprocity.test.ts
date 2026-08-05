import { describe, expect, it } from 'vitest';

import { inferRomanceReciprocity, mergeRomanceReciprocity } from './romanceReciprocity';

describe('romanceReciprocity', () => {
  it('keeps a personal crush one-sided until reciprocity is supported', () => {
    expect(inferRomanceReciprocity({ relationshipType: 'crush', evidence: 'I have a crush on Jamie.' }))
      .toBe('user_interest_only');
  });

  it('separates possible mutual interest from confirmed mutual interest', () => {
    expect(inferRomanceReciprocity({ evidence: 'I think she might like me.' }))
      .toBe('possible_mutual');
    expect(inferRomanceReciprocity({ evidence: 'She said she likes me too.' }))
      .toBe('mutual_interest');
  });

  it('treats explicit rejection as unrequited and does not casually downgrade mutual evidence', () => {
    expect(inferRomanceReciprocity({ status: 'unrequited', evidence: 'They turned me down.' }))
      .toBe('user_interest_only');
    expect(mergeRomanceReciprocity('mutual_interest', 'possible_mutual', 'active'))
      .toBe('mutual_interest');
    expect(mergeRomanceReciprocity('mutual_interest', 'user_interest_only', 'active'))
      .toBe('mutual_interest');
    expect(mergeRomanceReciprocity(
      'mutual_interest',
      'user_interest_only',
      'active',
      'They turned me down.',
    )).toBe('user_interest_only');
  });
});

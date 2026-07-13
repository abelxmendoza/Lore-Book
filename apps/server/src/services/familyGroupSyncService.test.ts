import { describe, it, expect } from 'vitest';

import { kinshipRoleFromName, charactersMentionedInTitle } from './familyGroupSyncService';

describe('familyGroupSync — pure helpers', () => {
  it('derives kinship roles from names across languages', () => {
    expect(kinshipRoleFromName('Tio Ralph')).toBe('uncle');
    expect(kinshipRoleFromName('Tía Grace')).toBe('aunt');
    expect(kinshipRoleFromName('Abuela Rosa')).toBe('grandparent');
    expect(kinshipRoleFromName('Stepdad Ben')).toBe('step-parent');
    expect(kinshipRoleFromName('Leslie')).toBeNull();
  });

  const chars = [
    { id: 'l1', name: 'Leslie', alias: [] },
    { id: 'r1', name: 'Tio Ralph', alias: ['Ralph'] },
    { id: 'x1', name: 'Marcus', alias: [] },
    { id: 's1', name: 'Sol', alias: [] },
  ];

  it('matches characters named in a group title (full name or alias token)', () => {
    const hits = charactersMentionedInTitle('Leslie & Tio Ralph Family', chars);
    expect(hits.map((h) => h.id).sort()).toEqual(['l1', 'r1']);
  });

  it('matches via alias when the title uses the short form', () => {
    const hits = charactersMentionedInTitle('Ralph Family', chars);
    expect(hits.map((h) => h.id)).toEqual(['r1']);
  });

  it('does not match kinship stopwords or short/unrelated names', () => {
    // "Tio Family" alone names nobody specific; "Sol" (3 chars) needs a full match.
    expect(charactersMentionedInTitle('Tio Family', chars)).toEqual([]);
    expect(charactersMentionedInTitle('Solar Flare Crew', chars)).toEqual([]);
  });

  it('handles diacritics and punctuation in titles', () => {
    const hits = charactersMentionedInTitle('Tío Ralph’s Family!', chars);
    expect(hits.map((h) => h.id)).toEqual(['r1']);
  });
});

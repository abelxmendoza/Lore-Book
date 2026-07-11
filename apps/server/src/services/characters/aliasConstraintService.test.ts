import { describe, expect, it } from 'vitest';

import { isValidAliasForCharacter, filterValidAliases } from './aliasConstraintService';

describe('isValidAliasForCharacter — relational placeholders', () => {
  // Regression: a relational-placeholder card ("friend of Shana") must never
  // accumulate its anchor's name as an alias during ingestion — that bad alias
  // was what falsely merged the placeholder into Shana.
  it('rejects the anchor name as an alias on a placeholder card', () => {
    expect(isValidAliasForCharacter('friend of Shana', 'Shana')).toBe(false);
  });

  it('rejects a placeholder as an alias on the anchor card', () => {
    expect(isValidAliasForCharacter('Shana', 'friend of Shana')).toBe(false);
  });

  it('still allows a genuine fuller-name alias', () => {
    expect(isValidAliasForCharacter('Derrik', 'Derrik Halvorsen')).toBe(true);
  });

  it('filters the anchor alias out of a placeholder card', () => {
    expect(filterValidAliases('friend of Shana', ['Shana', 'friend of Shana'])).toEqual([]);
  });
});

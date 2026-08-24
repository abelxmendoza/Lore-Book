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

describe('isValidAliasForCharacter — possessive/punctuation-only variants', () => {
  // Regression: renaming "Tio Ralph's" -> "Tio Ralph" to fix an accidental
  // possessive must never leave "Tio Ralph's" behind as a valid alias — it's
  // a typo correction, not a real alternate name.
  it('rejects a trailing-apostrophe-s variant of the canonical name', () => {
    expect(isValidAliasForCharacter('Tio Ralph', "Tio Ralph's")).toBe(false);
  });

  it('rejects the canonical name as an alias in the reverse direction too', () => {
    expect(isValidAliasForCharacter("Tio Ralph's", 'Tio Ralph')).toBe(false);
  });

  it('filters a possessive-variant alias out entirely', () => {
    expect(filterValidAliases('Tio Ralph', ["Tio Ralph's", 'Ralph'])).toEqual(['Ralph']);
  });
});

describe('isValidAliasForCharacter — spoken nicknames', () => {
  it('allows Killa as a nickname for Kiley Tafur', () => {
    expect(isValidAliasForCharacter('Kiley Tafur', 'Killa')).toBe(true);
  });
});

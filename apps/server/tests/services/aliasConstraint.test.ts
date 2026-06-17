import { describe, expect, it } from 'vitest';

import {
  areConflictingKinshipAliases,
  filterValidAliases,
  isValidAliasForCharacter,
  shouldMergeCharacterRecords,
} from '../../src/services/characters/aliasConstraintService';

describe('aliasConstraintService', () => {
  it('rejects different uncles as aliases of each other', () => {
    expect(areConflictingKinshipAliases('Tío Juan', 'Tío Ray')).toBe(true);
    expect(isValidAliasForCharacter('Tío Juan', 'Tío Ray')).toBe(false);
    expect(isValidAliasForCharacter('Tio Juan', 'Tio Ray')).toBe(false);
  });

  it('rejects grandmother title as alias for an uncle', () => {
    expect(areConflictingKinshipAliases('Tío Juan', 'Abuela')).toBe(true);
    expect(isValidAliasForCharacter('Tío Juan', 'Abuela')).toBe(false);
  });

  it('allows spelling variants for the same uncle', () => {
    expect(isValidAliasForCharacter('Tío Juan', 'Tio Juan')).toBe(true);
    expect(isValidAliasForCharacter('Tío Juan', 'Uncle Juan')).toBe(true);
  });

  it('filters polluted alias lists', () => {
    expect(
      filterValidAliases('Tío Juan', ['Tio Juan', 'Tío Ray', 'Abuela', 'Uncle Juan'])
    ).toEqual(expect.arrayContaining(['Tio Juan', 'Uncle Juan']));
    expect(
      filterValidAliases('Tío Juan', ['Tio Juan', 'Tío Ray', 'Abuela', 'Uncle Juan'])
    ).not.toEqual(expect.arrayContaining(['Tío Ray', 'Abuela']));
  });

  it('blocks merging distinct family members in payload merge', () => {
    expect(shouldMergeCharacterRecords('Tío Juan', 'Tío Ray')).toBe(false);
    expect(shouldMergeCharacterRecords('Tío Juan', 'Abuela')).toBe(false);
    expect(shouldMergeCharacterRecords('Tío Juan', 'Tio Juan', [], ['Tio Juan'])).toBe(true);
  });

  it('rejects alias that matches another character canonical name', () => {
    expect(
      isValidAliasForCharacter('Tío Juan', 'Abuela', { otherCanonicalNames: ['Abuela', 'Tío Ray'] })
    ).toBe(false);
  });
});

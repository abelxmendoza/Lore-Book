import { describe, expect, it } from 'vitest';

import {
  containmentIsPossessive,
  isTrailingPossessiveVariant,
  nameContained,
  namesOverlapByContainment,
  normalizeDuplicateKey,
  normalizeNameKey,
  splitPersonName,
  splitStructuredPersonName,
} from './nameNormalization';

describe('nameNormalization', () => {
  it('normalizes case, accents, and whitespace', () => {
    expect(normalizeNameKey('  Tía   Maribel  ')).toBe('tia maribel');
  });

  it('normalizeDuplicateKey collapses apostrophe possessive variants', () => {
    expect(normalizeDuplicateKey("Mom's House")).toBe(normalizeDuplicateKey('Moms House'));
    expect(normalizeDuplicateKey("Abuela's house")).toBe(normalizeDuplicateKey('Abuelas House'));
    expect(normalizeDuplicateKey("O'Brien")).toBe('obrien');
    // normalizeNameKey itself must keep apostrophes (possessive detection depends on it).
    expect(normalizeNameKey("Mom's House")).toBe("mom's house");
  });

  it('matches whole-token containment without substring collisions', () => {
    expect(nameContained('nico', 'uncle nico')).toBe(true);
    expect(namesOverlapByContainment('adrian patel', 'adrian patel my coding mentor')).toBe(true);
    expect(namesOverlapByContainment('nova', 'novara')).toBe(false);
  });

  it('flags possessive containment as ambiguous', () => {
    expect(namesOverlapByContainment('dana', "dana's meeting colleague")).toBe(true);
    expect(containmentIsPossessive('dana', "dana's meeting colleague")).toBe(true);
  });

  it('splits first and last names and strips kinship titles', () => {
    expect(splitPersonName('Adrian Patel')).toEqual({ firstName: 'Adrian', lastName: 'Patel' });
    expect(splitPersonName('Reese')).toEqual({ firstName: 'Reese', lastName: undefined });
    expect(splitPersonName('Aunt Maribel')).toEqual({ firstName: 'Maribel', lastName: undefined });
    expect(splitPersonName('Step Dad Ben')).toEqual({ firstName: 'Ben', lastName: undefined });
    expect(splitPersonName('Tía Grace Rivera')).toEqual({ firstName: 'Grace', lastName: 'Rivera' });
  });

  it('never puts kinship words into structured first/middle/last', () => {
    expect(splitStructuredPersonName('Step Dad Ben')).toEqual({
      firstName: 'Ben',
      middleName: '',
      lastName: '',
    });
    expect(splitStructuredPersonName('Benjamin Lopez')).toEqual({
      firstName: 'Benjamin',
      middleName: '',
      lastName: 'Lopez',
    });
  });

  describe('isTrailingPossessiveVariant', () => {
    it('detects an accidental trailing possessive on a person name', () => {
      expect(isTrailingPossessiveVariant("Tio Ralph's", 'Tio Ralph')).toBe(true);
      expect(isTrailingPossessiveVariant('Tio Ralph', "Tio Ralph's")).toBe(true);
    });

    it('detects a bare trailing apostrophe variant', () => {
      expect(isTrailingPossessiveVariant("James'", 'James')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isTrailingPossessiveVariant("TIO RALPH'S", 'tio ralph')).toBe(true);
    });

    it('returns false for identical names', () => {
      expect(isTrailingPossessiveVariant('Tio Ralph', 'Tio Ralph')).toBe(false);
    });

    it('returns false for genuinely different names', () => {
      expect(isTrailingPossessiveVariant('Tio Ralph', 'Tio Ramon')).toBe(false);
      expect(isTrailingPossessiveVariant("Mom's House", 'Dad House')).toBe(false);
    });

    // normalizeDuplicateKey handles this shape (both sides already carry an
    // "s") — isTrailingPossessiveVariant is a distinct, narrower check and
    // correctly does NOT treat this pair as a possessive-suffix variant.
    it('does not confuse a normalizeDuplicateKey match with a possessive-suffix variant', () => {
      expect(isTrailingPossessiveVariant("Mom's House", 'Moms House')).toBe(false);
    });
  });
});

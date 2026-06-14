import { describe, expect, it } from 'vitest';

import {
  containmentIsPossessive,
  nameContained,
  namesOverlapByContainment,
  normalizeNameKey,
  splitPersonName,
} from './nameNormalization';

describe('nameNormalization', () => {
  it('normalizes case, accents, and whitespace', () => {
    expect(normalizeNameKey('  Tía   Maribel  ')).toBe('tia maribel');
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

  it('splits first and last names without treating surnames as first names', () => {
    expect(splitPersonName('Adrian Patel')).toEqual({ firstName: 'Adrian', lastName: 'Patel' });
    expect(splitPersonName('Reese')).toEqual({ firstName: 'Reese', lastName: undefined });
    expect(splitPersonName('Aunt Maribel')).toEqual({ firstName: 'Aunt', lastName: 'Maribel' });
  });
});

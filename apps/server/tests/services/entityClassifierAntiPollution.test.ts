/**
 * Anti-pollution guarantees for the deterministic entity classifier.
 *
 * The classifier's core invariant: **PERSON requires positive evidence.** Apps,
 * products, brands, food/drink, companies, places, households, groups, and events
 * must NOT be classified as PERSON (and therefore must never be Character-eligible).
 * Bare proper nouns with no context resolve to UNKNOWN rather than defaulting to a
 * person.
 *
 * Complements `canonicalOntology.test.ts` (which spot-checks a few cases) with a
 * broad table so a regression in any lexicon or rule is caught.
 */
import { describe, expect, it } from 'vitest';

import { classifyEntity } from '../../src/services/entities/entityClassifier';
import { isCharacterEligible } from '../../src/services/ontology/canonical';
import type { EntityClass } from '../../src/services/ontology/canonical';

interface Case {
  name: string;
  context?: string;
  expectedType: EntityClass;
}

// Non-person entities that historically leaked into Character cards.
const NON_PERSON_CASES: Case[] = [
  // apps / software
  { name: 'Find My', expectedType: 'APP' },
  { name: 'Spotify', expectedType: 'APP' },
  { name: 'Instagram', expectedType: 'APP' },
  // food & drink
  { name: 'High Noon', expectedType: 'FOOD_DRINK' },
  { name: 'White Claw', expectedType: 'FOOD_DRINK' },
  { name: 'Red Bull', expectedType: 'FOOD_DRINK' },
  // products / devices
  { name: 'Amazon Ring', expectedType: 'PRODUCT' },
  { name: 'iPhone', expectedType: 'PRODUCT' },
  { name: 'PlayStation', expectedType: 'PRODUCT' },
  // companies / orgs
  { name: 'Amazon', expectedType: 'ORGANIZATION' },
  { name: 'Google', expectedType: 'ORGANIZATION' },
  { name: 'Microsoft', expectedType: 'ORGANIZATION' },
  // households (possessive dwellings)
  { name: "Mom's House", expectedType: 'HOUSEHOLD' },
  { name: "Abuela's House", expectedType: 'HOUSEHOLD' },
  // places
  { name: 'Moreno Valley', expectedType: 'PLACE' },
  { name: 'Los Angeles', expectedType: 'PLACE' },
  // groups / families
  { name: 'The Smith Family', expectedType: 'FAMILY' },
  { name: 'The Goon Squad', expectedType: 'GROUP' },
  // events
  { name: 'graduation party', expectedType: 'EVENT' },
  { name: 'birthday party', expectedType: 'EVENT' },
];

// Bare proper nouns with NO context must NOT become persons.
const UNCLASSIFIED_CASES: Case[] = [
  { name: 'Morgan Gray', expectedType: 'UNKNOWN' },
  { name: 'Jordan', expectedType: 'UNKNOWN' },
  { name: 'Riley Quinn', expectedType: 'UNKNOWN' },
];

// Genuine persons — honorific/kinship prefix or person-context predicate.
const PERSON_CASES: Case[] = [
  { name: 'Tio Ralph', expectedType: 'PERSON' },
  { name: 'Coach Dave', expectedType: 'PERSON' },
  { name: 'Aunt Carol', expectedType: 'PERSON' },
  { name: 'Marcus', context: 'my cousin Marcus came over for dinner', expectedType: 'PERSON' },
  { name: 'Marcus', context: 'Marcus said he would call me back', expectedType: 'PERSON' },
];

// Context promotes a bare noun to a location via locative prepositions.
const LOCATION_CONTEXT_CASES: Case[] = [
  { name: 'Berlin', context: 'we flew to Berlin last summer', expectedType: 'LOCATION' },
];

describe('entity classifier — anti-pollution', () => {
  describe('non-person entities are never PERSON or Character-eligible', () => {
    it.each(NON_PERSON_CASES.map((c) => [c.name, c] as const))('%s', (_n, c) => {
      const result = classifyEntity(c.name, c.context);
      expect(result.type, `${c.name} → ${result.type} (${result.reason})`).toBe(c.expectedType);
      expect(result.type).not.toBe('PERSON');
      expect(isCharacterEligible(result.type)).toBe(false);
    });
  });

  describe('bare proper nouns require evidence (UNKNOWN, not PERSON)', () => {
    it.each(UNCLASSIFIED_CASES.map((c) => [c.name, c] as const))('%s', (_n, c) => {
      const result = classifyEntity(c.name, c.context);
      expect(result.type, `${c.name} → ${result.type} (${result.reason})`).toBe(c.expectedType);
      expect(result.type).not.toBe('PERSON');
      expect(isCharacterEligible(result.type)).toBe(false);
    });
  });

  describe('genuine persons are PERSON and Character-eligible', () => {
    it.each(PERSON_CASES.map((c, i) => [`${c.name}-${i}`, c] as const))('%s', (_n, c) => {
      const result = classifyEntity(c.name, c.context);
      expect(result.type, `${c.name} → ${result.type} (${result.reason})`).toBe('PERSON');
      expect(isCharacterEligible(result.type)).toBe(true);
    });
  });

  describe('locative context yields LOCATION', () => {
    it.each(LOCATION_CONTEXT_CASES.map((c, i) => [`${c.name}-${i}`, c] as const))('%s', (_n, c) => {
      const result = classifyEntity(c.name, c.context);
      expect(result.type).toBe('LOCATION');
      expect(isCharacterEligible(result.type)).toBe(false);
    });
  });

  it('empty / too-short names are UNKNOWN with zero confidence', () => {
    expect(classifyEntity('').type).toBe('UNKNOWN');
    expect(classifyEntity('a').confidence).toBe(0);
  });
});

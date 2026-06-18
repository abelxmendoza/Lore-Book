/**
 * Totality checks for the canonical vocabulary mappers.
 *
 * These guard against a new enum value being added without a corresponding
 * mapping (which would silently fall through to UNKNOWN or throw). Every legacy
 * enum value must resolve to a valid RootType, and every RootType must have a
 * storage- and omega-type mapping.
 */
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ROOT_TYPES,
  isRootType,
  isCharacterEligibleRoot,
  entityClassToRootType,
  lexicalEntityTypeToRootType,
  llmEntityTypeToRootType,
  toStorageType,
  toOmegaType,
  type EntityClass,
  type LlmEntityType,
} from '../../src/services/ontology/canonical';
import type { LexicalEntityType } from '../../src/services/lexical/lexicalTypes';

// Keep these arrays in sync with the unions they mirror. If a union grows and
// these arrays are not updated, the corresponding mapper change is also missing —
// these tests are the trip-wire that forces both to be updated together.
const ALL_LEXICAL_ENTITY_TYPES: readonly LexicalEntityType[] = [
  'PERSON', 'ORGANIZATION', 'PLACE', 'PROJECT', 'SKILL', 'ROLE', 'RELATIONSHIP',
  'EVENT', 'DATE', 'TIME', 'OBJECT', 'MEDIA', 'EMOTION', 'GOAL', 'CONFLICT',
  'IDENTITY_CLAIM', 'PREFERENCE', 'ROUTINE', 'LOCATION_CATEGORY',
];

const ALL_ENTITY_CLASSES: readonly EntityClass[] = [
  'PERSON', 'FAMILY', 'PLACE', 'LOCATION', 'HOUSEHOLD', 'GROUP', 'ORGANIZATION',
  'COMPANY', 'PROJECT', 'PRODUCT', 'BRAND', 'APP', 'SKILL', 'PET', 'VEHICLE',
  'MEDIA', 'FOOD_DRINK', 'EVENT', 'UNKNOWN', 'UNCLASSIFIED',
];

const ALL_LLM_ENTITY_TYPES: readonly LlmEntityType[] = [
  'PERSON', 'PLACE', 'ORGANIZATION', 'CONCEPT', 'ANIMAL', 'OBJECT',
];

describe('canonical mapper totality', () => {
  it('every LexicalEntityType maps to a valid (non-UNKNOWN) RootType', () => {
    for (const t of ALL_LEXICAL_ENTITY_TYPES) {
      const root = lexicalEntityTypeToRootType(t);
      expect(isRootType(root), `${t} → ${root}`).toBe(true);
      expect(root, `${t} should be explicitly mapped`).not.toBe('UNKNOWN');
    }
  });

  it('every EntityClass maps to a valid RootType', () => {
    for (const c of ALL_ENTITY_CLASSES) {
      const root = entityClassToRootType(c);
      expect(isRootType(root), `${c} → ${root}`).toBe(true);
    }
  });

  it('every LlmEntityType maps to a valid RootType', () => {
    for (const t of ALL_LLM_ENTITY_TYPES) {
      const root = llmEntityTypeToRootType(t);
      expect(isRootType(root), `${t} → ${root}`).toBe(true);
    }
  });

  it('every RootType has a storage-type and omega-type mapping', () => {
    for (const root of CANONICAL_ROOT_TYPES) {
      expect(() => toStorageType(root), `toStorageType(${root})`).not.toThrow();
      expect(() => toOmegaType(root), `toOmegaType(${root})`).not.toThrow();
      expect(typeof toStorageType(root)).toBe('string');
      expect(typeof toOmegaType(root)).toBe('string');
    }
  });

  it('only PERSON is character-eligible', () => {
    const eligible = CANONICAL_ROOT_TYPES.filter((r) => isCharacterEligibleRoot(r));
    expect(eligible).toEqual(['PERSON']);
  });

  it('UNKNOWN and UNCLASSIFIED legacy classes both collapse to UNKNOWN root', () => {
    expect(entityClassToRootType('UNKNOWN')).toBe('UNKNOWN');
    expect(entityClassToRootType('UNCLASSIFIED')).toBe('UNKNOWN');
  });

  it('anti-person LLM/lexical types never collapse to PERSON', () => {
    expect(llmEntityTypeToRootType('OBJECT')).not.toBe('PERSON');
    expect(llmEntityTypeToRootType('ANIMAL')).not.toBe('PERSON');
    expect(lexicalEntityTypeToRootType('OBJECT')).not.toBe('PERSON');
    expect(lexicalEntityTypeToRootType('ROLE')).not.toBe('PERSON');
  });
});

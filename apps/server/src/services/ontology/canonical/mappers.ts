/**
 * Vocabulary mappers — collapse legacy enums onto canonical RootType.
 */
import type { LexicalEntityType } from '../../lexical/lexicalTypes';
import type { RootType } from './rootType';
import { isCharacterEligibleRoot, isUnknownRoot } from './rootType';

/** @deprecated Legacy classifier output — duplicates collapse via entityClassToRootType. */
export type EntityClass =
  | 'PERSON' | 'FAMILY' | 'PLACE' | 'LOCATION' | 'HOUSEHOLD' | 'GROUP'
  | 'ORGANIZATION' | 'COMPANY' | 'PROJECT' | 'PRODUCT' | 'BRAND' | 'APP'
  | 'SKILL' | 'PET' | 'VEHICLE' | 'MEDIA' | 'FOOD_DRINK' | 'EVENT'
  | 'UNKNOWN' | 'UNCLASSIFIED';

/** LLM unified extraction entity enum (mergedExtractor). */
export type LlmEntityType =
  | 'PERSON'
  | 'PLACE'
  | 'ORGANIZATION'
  | 'CONCEPT'
  | 'ANIMAL'
  | 'OBJECT';

export type StorageType =
  | 'person'
  | 'place'
  | 'organization'
  | 'platform'
  | 'event'
  | 'unclassified';

export type LegacyOmegaEntityType =
  | 'PERSON' | 'CHARACTER' | 'LOCATION' | 'ORG' | 'EVENT'
  | 'PRODUCT' | 'APP' | 'BRAND' | 'PROJECT' | 'SKILL' | 'PET' | 'VEHICLE'
  | 'MEDIA' | 'FOOD_DRINK' | 'UNKNOWN';

const ENTITY_CLASS_TO_ROOT: Record<EntityClass, RootType> = {
  PERSON: 'PERSON',
  FAMILY: 'FAMILY',
  PLACE: 'LOCATION',
  LOCATION: 'LOCATION',
  HOUSEHOLD: 'LOCATION',
  GROUP: 'GROUP',
  ORGANIZATION: 'ORGANIZATION',
  COMPANY: 'ORGANIZATION',
  PROJECT: 'PROJECT',
  PRODUCT: 'PRODUCT',
  BRAND: 'BRAND',
  APP: 'APP',
  SKILL: 'SKILL',
  PET: 'PET',
  VEHICLE: 'VEHICLE',
  MEDIA: 'MEDIA',
  FOOD_DRINK: 'FOODDRINK',
  EVENT: 'EVENT',
  UNKNOWN: 'UNKNOWN',
  UNCLASSIFIED: 'UNKNOWN',
};

const LEXICAL_TO_ROOT: Partial<Record<LexicalEntityType, RootType>> = {
  PERSON: 'PERSON',
  ORGANIZATION: 'ORGANIZATION',
  PLACE: 'LOCATION',
  PROJECT: 'PROJECT',
  SKILL: 'SKILL',
  EVENT: 'EVENT',
  MEDIA: 'MEDIA',
  GOAL: 'GOAL',
  OBJECT: 'POSSESSION',
  TIME: 'TIME',
  DATE: 'TIME',
  EMOTION: 'CONCEPT',
  CONFLICT: 'CONCEPT',
  IDENTITY_CLAIM: 'CONCEPT',
  PREFERENCE: 'CONCEPT',
  ROUTINE: 'CONCEPT',
  RELATIONSHIP: 'CONCEPT',
  ROLE: 'CONCEPT',
  LOCATION_CATEGORY: 'LOCATION',
};

const LLM_TO_ROOT: Record<LlmEntityType, RootType> = {
  PERSON: 'PERSON',
  PLACE: 'LOCATION',
  ORGANIZATION: 'ORGANIZATION',
  CONCEPT: 'CONCEPT',
  ANIMAL: 'PET',
  OBJECT: 'POSSESSION',
};

/** Collapse legacy EntityClass duplicates onto canonical RootType. */
export function entityClassToRootType(c: EntityClass): RootType {
  return ENTITY_CLASS_TO_ROOT[c];
}

/** Map lexical signal types to canonical roots. Unmapped signals → UNKNOWN. */
export function lexicalEntityTypeToRootType(t: LexicalEntityType): RootType {
  return LEXICAL_TO_ROOT[t] ?? 'UNKNOWN';
}

/** Map LLM extraction entity types to canonical roots. */
export function llmEntityTypeToRootType(t: LlmEntityType): RootType {
  return LLM_TO_ROOT[t];
}

export function toStorageType(root: RootType): StorageType;
export function toStorageType(c: EntityClass): StorageType;
export function toStorageType(input: RootType | EntityClass): StorageType {
  const root = resolveRoot(input);
  switch (root) {
    case 'PERSON':
      return 'person';
    case 'LOCATION':
      return 'place';
    case 'ORGANIZATION':
    case 'FAMILY':
    case 'GROUP':
    case 'BRAND':
      return 'organization';
    case 'PROJECT':
    case 'PRODUCT':
    case 'APP':
    case 'SKILL':
    case 'PET':
    case 'VEHICLE':
    case 'MEDIA':
    case 'FOODDRINK':
    case 'POSSESSION':
      return 'platform';
    case 'EVENT':
      return 'event';
    case 'CONCEPT':
    case 'GOAL':
    case 'TIME':
    case 'UNKNOWN':
      return 'unclassified';
  }
}

export function toOmegaType(root: RootType): LegacyOmegaEntityType;
export function toOmegaType(c: EntityClass): LegacyOmegaEntityType;
export function toOmegaType(input: RootType | EntityClass): LegacyOmegaEntityType {
  const root = resolveRoot(input);
  switch (root) {
    case 'PERSON':
      return 'PERSON';
    case 'LOCATION':
      return 'LOCATION';
    case 'ORGANIZATION':
    case 'FAMILY':
    case 'GROUP':
      return 'ORG';
    case 'EVENT':
      return 'EVENT';
    case 'PRODUCT':
      return 'PRODUCT';
    case 'APP':
      return 'APP';
    case 'BRAND':
      return 'BRAND';
    case 'PROJECT':
      return 'PROJECT';
    case 'SKILL':
      return 'SKILL';
    case 'PET':
      return 'PET';
    case 'VEHICLE':
      return 'VEHICLE';
    case 'MEDIA':
      return 'MEDIA';
    case 'FOODDRINK':
      return 'FOOD_DRINK';
    case 'CONCEPT':
    case 'GOAL':
    case 'TIME':
    case 'POSSESSION':
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

export function isUnknownEntity(c: EntityClass): boolean {
  return c === 'UNKNOWN' || c === 'UNCLASSIFIED';
}

export function isCharacterEligible(c: EntityClass): boolean {
  return isCharacterEligibleRoot(entityClassToRootType(c));
}

export function isUnknownRootType(root: RootType): boolean {
  return isUnknownRoot(root);
}

function resolveRoot(input: RootType | EntityClass): RootType {
  if (Object.prototype.hasOwnProperty.call(ENTITY_CLASS_TO_ROOT, input)) {
    return ENTITY_CLASS_TO_ROOT[input as EntityClass];
  }
  return input as RootType;
}

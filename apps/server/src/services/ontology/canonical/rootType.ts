/**
 * Canonical root ontology — stable vocabulary every layer joins on.
 * See docs/dynamic-classification-model.md (Phase 2).
 *
 * Subcategories and swimlanes live in the `classifications` table, not here.
 */

/** Stable root types (~18). Changes are governance events, not feature work. */
export type RootType =
  | 'PERSON'
  | 'FAMILY'
  | 'GROUP'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'EVENT'
  | 'PROJECT'
  | 'PRODUCT'
  | 'APP'
  | 'BRAND'
  | 'MEDIA'
  | 'SKILL'
  | 'PET'
  | 'VEHICLE'
  | 'FOODDRINK'
  | 'POSSESSION'
  | 'CONCEPT'
  | 'GOAL'
  | 'TIME'
  | 'UNKNOWN';

export const CANONICAL_ROOT_TYPES: readonly RootType[] = [
  'PERSON',
  'FAMILY',
  'GROUP',
  'ORGANIZATION',
  'LOCATION',
  'EVENT',
  'PROJECT',
  'PRODUCT',
  'APP',
  'BRAND',
  'MEDIA',
  'SKILL',
  'PET',
  'VEHICLE',
  'FOODDRINK',
  'POSSESSION',
  'CONCEPT',
  'GOAL',
  'TIME',
  'UNKNOWN',
] as const;

/** Only PERSON roots may be promoted to Character cards. */
export const CHARACTER_ELIGIBLE_ROOTS: ReadonlySet<RootType> = new Set<RootType>(['PERSON']);

export function isRootType(value: string): value is RootType {
  return (CANONICAL_ROOT_TYPES as readonly string[]).includes(value);
}

export function isCharacterEligibleRoot(root: RootType): boolean {
  return CHARACTER_ELIGIBLE_ROOTS.has(root);
}

export function isUnknownRoot(root: RootType): boolean {
  return root === 'UNKNOWN';
}

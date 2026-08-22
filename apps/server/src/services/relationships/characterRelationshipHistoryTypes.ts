/**
 * Lane-aware relationship-history projection types.
 *
 * characterRelationshipAuthorityService owns the canonical append-only write
 * path and the single-winner current state. This module is the read-side
 * view: kinship and social standing can both be current, and ended /
 * historical / corrected-never stay distinct for timeline surfaces.
 *
 * Rows are mapped from the existing `character_relationship_history` table
 * and MutationAuthority vocabulary. There is no second schema.
 */
import type { MutationAuthority } from '../canonicalMutation/canonicalMutationTypes';

export const RELATIONSHIP_PROJECTION = 'relationship_projection' as const;

export type RelationshipAssertionKind =
  | 'asserted'
  | 'ended'
  | 'corrected_never'
  | 'destroyed';

export type RelationshipValidPrecision = 'exact' | 'date' | 'month' | 'year' | 'unknown';

export type CharacterRelationshipHistoryRow = {
  id: string;
  userId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  pairKey: string;
  relationshipType: string;
  assertionKind: RelationshipAssertionKind;
  authority: MutationAuthority;
  recordedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  validPrecision: RelationshipValidPrecision;
  correctsHistoryId: string | null;
  idempotencyKey: string | null;
  evidenceIds: string[];
  confidence: number | null;
};

export type ProjectedRelationshipLane = {
  lane: string;
  relationshipType: string;
  historyId: string;
  authority: MutationAuthority;
  validFrom: string | null;
  validUntil: string | null;
  validPrecision: RelationshipValidPrecision;
};

export type PairRelationshipProjection = {
  pairKey: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  /** Authority-ranked open states, one winner per lane. */
  current: ProjectedRelationshipLane[];
  historical: ProjectedRelationshipLane[];
  ended: ProjectedRelationshipLane[];
  correctedNever: ProjectedRelationshipLane[];
};

/** Same order as characterRelationshipAuthorityService — must not drift. */
export const RELATIONSHIP_AUTHORITY_RANK: Record<MutationAuthority, number> = {
  USER_EXPLICIT: 5,
  USER_CONFIRMED: 4,
  MANUAL_OPERATOR: 3,
  IMPORTED_SOURCE: 2,
  SYSTEM_DERIVED: 1,
};

/**
 * Character relationship history is a log of asserted STATES (intervals),
 * not from→to transitions.
 *
 * A transition log cannot distinguish:
 *   "We're not friends anymore" (historical friend remains true)
 *   "We were never friends" (prior friend assertion is corrected/invalid)
 *
 * Bi-temporal fields:
 *   recorded_at     = write time
 *   valid_from/until = relationship-change time at honest precision
 */

export const RELATIONSHIP_PROJECTION = 'relationship_projection' as const;

export type RelationshipAuthority =
  | 'USER_EXPLICIT'
  | 'USER_CONFIRMED'
  | 'IMPORTED_SOURCE'
  | 'SYSTEM_INFERENCE';

export type RelationshipAssertionKind =
  | 'asserted'
  | 'ended'
  | 'corrected_never'
  | 'destroyed';

export type RelationshipValidPrecision = 'exact' | 'date' | 'month' | 'year' | 'unknown';

export type RelationshipWriteIntent = 'assert' | 'end' | 'correct' | 'destroy';

export type CharacterRelationshipHistoryRow = {
  id: string;
  userId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  pairKey: string;
  relationshipType: string;
  assertionKind: RelationshipAssertionKind;
  authority: RelationshipAuthority;
  recordedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  validPrecision: RelationshipValidPrecision;
  supersededById: string | null;
  idempotencyKey: string;
  mutationKey?: string | null;
  sourceMessageId: string | null;
  evidence: string | null;
  confidence: number | null;
};

export type ProjectedRelationshipLane = {
  lane: string;
  relationshipType: string;
  historyId: string;
  authority: RelationshipAuthority;
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

export type CharacterRelationshipWrite = {
  userId: string;
  actorId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  relationshipType: string;
  intent: RelationshipWriteIntent;
  authority: RelationshipAuthority;
  recordedAt?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  validPrecision?: RelationshipValidPrecision;
  sourceMessageId?: string | null;
  evidence?: string | null;
  confidence?: number | null;
  closenessScore?: number | null;
  summary?: string | null;
  rationale?: string;
};

export const RELATIONSHIP_AUTHORITY_RANK: Record<RelationshipAuthority, number> = {
  USER_EXPLICIT: 40,
  USER_CONFIRMED: 30,
  IMPORTED_SOURCE: 20,
  SYSTEM_INFERENCE: 10,
};

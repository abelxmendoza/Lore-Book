import { createHash } from 'node:crypto';

import type { MutationAuthority } from '../canonicalMutation/canonicalMutationTypes';
import type {
  RelationshipChangeKind,
  RelationshipHistoryRow,
} from '../characters/characterRelationshipAuthorityService';
import { characterPairKey } from './relationshipDelta';
import {
  RELATIONSHIP_AUTHORITY_RANK,
  type CharacterRelationshipHistoryRow,
  type PairRelationshipProjection,
  type ProjectedRelationshipLane,
  type RelationshipAssertionKind,
  type RelationshipValidPrecision,
} from './characterRelationshipHistoryTypes';

export { characterPairKey };

export function relationshipLane(relationshipType: string): string {
  const type = relationshipType.trim().toLowerCase();
  if (/^(friend|best_friend|close_friend|acquaintance|stranger|colleague|coworker)$/.test(type)) {
    return 'social_standing';
  }
  return `type:${type}`;
}

export function relationshipHistoryIdempotencyKey(input: {
  userId: string;
  pairKey: string;
  relationshipType: string;
  assertionKind: RelationshipAssertionKind;
  authority: MutationAuthority;
  validFrom: string | null;
  validUntil: string | null;
  validPrecision: RelationshipValidPrecision;
  sourceMessageId: string | null;
}): string {
  const material = [
    input.userId,
    input.pairKey,
    input.relationshipType.trim().toLowerCase(),
    input.assertionKind,
    input.authority,
    input.validFrom ?? '',
    input.validUntil ?? '',
    input.validPrecision,
    input.sourceMessageId ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

export function assertionKindForChangeKind(
  changeKind: RelationshipChangeKind,
  toRelationshipType: string | null,
  toStatus: string | null,
): RelationshipAssertionKind {
  if (changeKind === 'ENDED') return 'ended';
  if (changeKind === 'CORRECTED' && toRelationshipType == null && toStatus == null) {
    return 'corrected_never';
  }
  return 'asserted';
}

export type AuthorityHistoryRecord = RelationshipHistoryRow & {
  userId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  idempotencyKey?: string | null;
};

/**
 * Map a canonical ledger row onto the lane projector. validPrecision is
 * projection-only — the live table has changed_at / valid_until, not a
 * precision column — so reads default to `unknown`.
 */
export function mapAuthorityHistoryRow(row: AuthorityHistoryRecord): CharacterRelationshipHistoryRow {
  const relationshipType = row.toRelationshipType ?? row.fromRelationshipType ?? '';
  return {
    id: row.id,
    userId: row.userId,
    sourceCharacterId: row.sourceCharacterId,
    targetCharacterId: row.targetCharacterId,
    pairKey: characterPairKey(row.sourceCharacterId, row.targetCharacterId),
    relationshipType,
    assertionKind: assertionKindForChangeKind(row.changeKind, row.toRelationshipType, row.toStatus),
    authority: row.authority,
    recordedAt: row.recordedAt,
    validFrom: row.changedAt,
    validUntil: row.validUntil,
    validPrecision: 'unknown',
    correctsHistoryId: row.correctsHistoryId,
    idempotencyKey: row.idempotencyKey ?? null,
    evidenceIds: row.evidenceIds ?? [],
    confidence: row.confidence,
  };
}

function parseMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function asLane(row: CharacterRelationshipHistoryRow): ProjectedRelationshipLane {
  return {
    lane: relationshipLane(row.relationshipType),
    relationshipType: row.relationshipType,
    historyId: row.id,
    authority: row.authority,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    validPrecision: row.validPrecision,
  };
}

function rankRow(row: CharacterRelationshipHistoryRow): number {
  return RELATIONSHIP_AUTHORITY_RANK[row.authority] ?? 0;
}

function eventTime(row: CharacterRelationshipHistoryRow): number {
  return parseMs(row.validFrom) || parseMs(row.validUntil) || parseMs(row.recordedAt);
}

function betterWinner(
  candidate: CharacterRelationshipHistoryRow,
  incumbent: CharacterRelationshipHistoryRow | null,
): boolean {
  if (!incumbent) return true;
  const rankDelta = rankRow(candidate) - rankRow(incumbent);
  if (rankDelta !== 0) return rankDelta > 0;
  const timeDelta = eventTime(candidate) - eventTime(incumbent);
  if (timeDelta !== 0) return timeDelta > 0;
  return parseMs(candidate.recordedAt) > parseMs(incumbent.recordedAt);
}

/**
 * Current state is the highest-authority open assertion in a lane.
 * Write recency cannot outrank a stronger authority.
 */
export function projectCharacterRelationshipHistory(
  rows: CharacterRelationshipHistoryRow[],
): PairRelationshipProjection[] {
  const byPair = new Map<string, CharacterRelationshipHistoryRow[]>();
  for (const row of rows) {
    if (row.assertionKind === 'destroyed') continue;
    const list = byPair.get(row.pairKey) ?? [];
    list.push(row);
    byPair.set(row.pairKey, list);
  }

  const projections: PairRelationshipProjection[] = [];
  for (const [pairKey, pairRows] of byPair) {
    const directed = pairRows[0]!;
    const retractedIds = new Set(
      pairRows.filter((row) => row.correctsHistoryId).map((row) => row.correctsHistoryId as string),
    );
    const correctedTypes = new Set(
      pairRows
        .filter((row) => row.assertionKind === 'corrected_never')
        .map((row) => row.relationshipType.trim().toLowerCase())
        .filter(Boolean),
    );

    const historical: ProjectedRelationshipLane[] = [];
    const ended: ProjectedRelationshipLane[] = [];
    const correctedNever: ProjectedRelationshipLane[] = [];
    const winnerByType = new Map<string, CharacterRelationshipHistoryRow>();

    for (const row of pairRows) {
      const type = row.relationshipType.trim().toLowerCase();
      if (retractedIds.has(row.id) || row.assertionKind === 'corrected_never' || (type && correctedTypes.has(type))) {
        correctedNever.push(asLane(row));
        continue;
      }
      if (row.assertionKind === 'ended') {
        ended.push(asLane(row));
        historical.push(asLane(row));
      } else {
        historical.push(asLane(row));
      }
      if (!type) continue;
      const incumbent = winnerByType.get(type) ?? null;
      if (betterWinner(row, incumbent)) winnerByType.set(type, row);
    }

    const openAsserted = [...winnerByType.values()].filter(
      (row) => row.assertionKind === 'asserted' && !row.validUntil,
    );
    const currentByLane = new Map<string, CharacterRelationshipHistoryRow>();
    for (const row of openAsserted) {
      const lane = relationshipLane(row.relationshipType);
      const incumbent = currentByLane.get(lane) ?? null;
      if (betterWinner(row, incumbent)) currentByLane.set(lane, row);
    }

    projections.push({
      pairKey,
      sourceCharacterId: directed.sourceCharacterId,
      targetCharacterId: directed.targetCharacterId,
      current: [...currentByLane.values()].map(asLane),
      historical,
      ended,
      correctedNever,
    });
  }

  return projections;
}

export function projectedCurrentForPair(
  rows: CharacterRelationshipHistoryRow[],
  pairKey: string,
): ProjectedRelationshipLane[] {
  return projectCharacterRelationshipHistory(rows).find((item) => item.pairKey === pairKey)?.current ?? [];
}

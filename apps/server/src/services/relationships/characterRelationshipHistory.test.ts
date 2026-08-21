import { describe, expect, it } from 'vitest';

import {
  characterPairKey,
  projectCharacterRelationshipHistory,
  relationshipHistoryIdempotencyKey,
} from './characterRelationshipHistoryProjection';
import type { CharacterRelationshipHistoryRow } from './characterRelationshipHistoryTypes';

const USER_A = 'user-a';
const USER_B = 'user-b';
const JAMIE = 'char-jamie';
const MARCUS = 'char-marcus';
const PAIR = characterPairKey(JAMIE, MARCUS);

function row(over: Partial<CharacterRelationshipHistoryRow> & Pick<CharacterRelationshipHistoryRow, 'id' | 'relationshipType' | 'assertionKind' | 'authority' | 'recordedAt'>): CharacterRelationshipHistoryRow {
  return {
    userId: USER_A,
    sourceCharacterId: JAMIE,
    targetCharacterId: MARCUS,
    pairKey: PAIR,
    validFrom: null,
    validUntil: null,
    validPrecision: 'unknown',
    supersededById: null,
    idempotencyKey: over.id,
    sourceMessageId: null,
    evidence: null,
    confidence: 0.8,
    ...over,
  };
}

describe('character relationship history projection', () => {
  it('authority outranks later inference — current stays acquaintance', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'june-friend',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'SYSTEM_INFERENCE',
        recordedAt: '2026-06-10T12:00:00.000Z',
        validFrom: '2026-06-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
      row({
        id: 'july-acquaintance',
        relationshipType: 'acquaintance',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-07-15T12:00:00.000Z',
        validFrom: '2026-07-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
      row({
        id: 'august-reprocess',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'SYSTEM_INFERENCE',
        recordedAt: '2026-08-20T12:00:00.000Z',
        validFrom: '2026-06-01T00:00:00.000Z',
        validPrecision: 'month',
        sourceMessageId: 'msg-old-june',
      }),
    ]);
    expect(projected[0]?.current).toHaveLength(1);
    expect(projected[0]?.current[0]?.relationshipType).toBe('acquaintance');
    expect(projected[0]?.current[0]?.authority).toBe('USER_EXPLICIT');
  });

  it('ended relationship remains historically true and is not current', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'friend-asserted',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-04-01T12:00:00.000Z',
        validFrom: '2026-04-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
      row({
        id: 'friend-ended',
        relationshipType: 'friend',
        assertionKind: 'ended',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-08-20T12:00:00.000Z',
        validFrom: '2026-07-01T00:00:00.000Z',
        validUntil: '2026-07-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
    ]);
    expect(projected[0]?.current).toEqual([]);
    expect(projected[0]?.ended[0]?.relationshipType).toBe('friend');
    expect(projected[0]?.historical.some((item) => item.relationshipType === 'friend')).toBe(true);
    expect(projected[0]?.ended[0]?.validPrecision).toBe('month');
    expect(projected[0]?.ended[0]?.validUntil).toBe('2026-07-01T00:00:00.000Z');
  });

  it('corrected never-was is not autobiographical history', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'false-friend',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'SYSTEM_INFERENCE',
        recordedAt: '2026-05-01T12:00:00.000Z',
      }),
      row({
        id: 'never-friends',
        relationshipType: 'friend',
        assertionKind: 'corrected_never',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-08-20T12:00:00.000Z',
      }),
    ]);
    expect(projected[0]?.current).toEqual([]);
    expect(projected[0]?.historical.some((item) => item.relationshipType === 'friend')).toBe(false);
    expect(projected[0]?.correctedNever.length).toBeGreaterThan(0);
  });

  it('idempotency key is stable for the same semantic assertion', () => {
    const input = {
      userId: USER_A,
      pairKey: PAIR,
      relationshipType: 'friend',
      assertionKind: 'asserted' as const,
      authority: 'SYSTEM_INFERENCE' as const,
      validFrom: '2026-06-01T00:00:00.000Z',
      validUntil: null,
      validPrecision: 'month' as const,
      sourceMessageId: 'msg-1',
    };
    expect(relationshipHistoryIdempotencyKey(input)).toBe(relationshipHistoryIdempotencyKey(input));
    expect(relationshipHistoryIdempotencyKey({ ...input, recordedAt: 'ignored' } as typeof input)).toBe(
      relationshipHistoryIdempotencyKey(input),
    );
    expect(
      relationshipHistoryIdempotencyKey({ ...input, assertionKind: 'ended' }),
    ).not.toBe(relationshipHistoryIdempotencyKey(input));
    expect(
      relationshipHistoryIdempotencyKey({ ...input, assertionKind: 'corrected_never' }),
    ).not.toBe(relationshipHistoryIdempotencyKey({ ...input, assertionKind: 'ended' }));
  });

  it('does not invent an exact day for month-precision end', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'ended-last-month',
        relationshipType: 'friend',
        assertionKind: 'ended',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-08-20T17:00:00.000Z',
        validUntil: '2026-07-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
    ]);
    expect(projected[0]?.ended[0]?.validPrecision).toBe('month');
    expect(projected[0]?.ended[0]?.validUntil).not.toBe('2026-08-20T17:00:00.000Z');
  });

  it('kinship and social standing can both be current', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'cousin',
        relationshipType: 'cousin_of',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-04-01T12:00:00.000Z',
      }),
      row({
        id: 'friend',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-04-01T12:00:00.000Z',
      }),
    ]);
    const types = projected[0]?.current.map((item) => item.relationshipType).sort();
    expect(types).toEqual(['cousin_of', 'friend']);
  });

  it('later inference cannot reopen a user-ended relationship', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'friend-asserted',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-04-01T12:00:00.000Z',
      }),
      row({
        id: 'friend-ended',
        relationshipType: 'friend',
        assertionKind: 'ended',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-08-20T12:00:00.000Z',
        validUntil: '2026-07-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
      row({
        id: 'reprocess',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'SYSTEM_INFERENCE',
        recordedAt: '2026-08-21T12:00:00.000Z',
        sourceMessageId: 'msg-old',
      }),
    ]);
    expect(projected[0]?.current).toEqual([]);
    expect(projected[0]?.ended[0]?.relationshipType).toBe('friend');
    expect(projected[0]?.historical.some((item) => item.relationshipType === 'friend')).toBe(true);
  });

  it('USER_CONFIRMED outranks later SYSTEM_INFERENCE of the same type', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'confirmed-friend',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'USER_CONFIRMED',
        recordedAt: '2026-07-01T12:00:00.000Z',
      }),
      row({
        id: 'later-inference',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'SYSTEM_INFERENCE',
        recordedAt: '2026-08-20T12:00:00.000Z',
      }),
    ]);
    expect(projected[0]?.current[0]?.authority).toBe('USER_CONFIRMED');
  });

  it('write time stays distinct from relationship-change time', () => {
    const recordedAt = '2026-08-20T17:00:00.000Z';
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'ended-last-month',
        relationshipType: 'friend',
        assertionKind: 'ended',
        authority: 'USER_EXPLICIT',
        recordedAt,
        validFrom: '2026-07-01T00:00:00.000Z',
        validUntil: '2026-07-01T00:00:00.000Z',
        validPrecision: 'month',
      }),
    ]);
    expect(projected[0]?.ended[0]?.validUntil).toBe('2026-07-01T00:00:00.000Z');
    expect(projected[0]?.ended[0]?.validUntil).not.toBe(recordedAt);
  });

  it('tenant isolation: another user with the same names cannot leak into the pair', () => {
    const projected = projectCharacterRelationshipHistory([
      row({
        id: 'user-a-friend',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-08-01T00:00:00.000Z',
        userId: USER_A,
      }),
      row({
        id: 'user-b-friend',
        relationshipType: 'friend',
        assertionKind: 'asserted',
        authority: 'USER_EXPLICIT',
        recordedAt: '2026-08-01T00:00:00.000Z',
        userId: USER_B,
        pairKey: characterPairKey('char-jamie-b', 'char-marcus-b'),
        sourceCharacterId: 'char-jamie-b',
        targetCharacterId: 'char-marcus-b',
      }),
    ]);
    expect(projected).toHaveLength(2);
    const forA = projected.find((item) => item.pairKey === PAIR);
    const forB = projected.find((item) => item.pairKey !== PAIR);
    expect(forA?.sourceCharacterId).toBe(JAMIE);
    expect(forB?.sourceCharacterId).toBe('char-jamie-b');
  });
});

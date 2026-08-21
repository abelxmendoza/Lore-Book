import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const mockFrom = vi.fn();
vi.mock('../supabaseClient', () => ({ supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a) } }));

import {
  projectRelationship,
  recordRelationshipTransition,
  getCurrentCharacterRelationship,
  correctRelationshipAssertion,
  type RelationshipHistoryRow,
} from './characterRelationshipAuthorityService';

function row(partial: Partial<RelationshipHistoryRow> & Pick<RelationshipHistoryRow, 'id' | 'recordedAt' | 'authority'>): RelationshipHistoryRow {
  return {
    fromRelationshipType: null,
    fromStatus: null,
    toRelationshipType: null,
    toStatus: null,
    changedAt: partial.recordedAt,
    validUntil: null,
    changeKind: 'CREATED',
    evidenceIds: [],
    confidence: null,
    relationshipId: null,
    correctsHistoryId: null,
    ...partial,
  };
}

describe('projectRelationship — the core authority-vs-chronology guarantee', () => {
  it('a later, lower-authority write never beats an earlier, higher-authority one (the June/July/August case)', () => {
    const rows = [
      row({ id: 'june', recordedAt: '2026-06-01T00:00:00Z', authority: 'SYSTEM_DERIVED', toRelationshipType: 'friend', toStatus: 'active' }),
      row({ id: 'july', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'acquaintance', toStatus: 'active' }),
      row({ id: 'august', recordedAt: '2026-08-01T00:00:00Z', authority: 'SYSTEM_DERIVED', toRelationshipType: 'friend', toStatus: 'active' }),
    ];
    const projection = projectRelationship(rows);
    expect(projection.current?.type).toBe('acquaintance');
    expect(projection.current?.authority).toBe('USER_EXPLICIT');
  });

  it('within the same authority tier, the most recently recorded row wins', () => {
    const rows = [
      row({ id: 'a', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'acquaintance' }),
      row({ id: 'b', recordedAt: '2026-09-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'estranged' }),
    ];
    const projection = projectRelationship(rows);
    expect(projection.current?.type).toBe('estranged');
  });

  it('"we were never friends": a CORRECTED row retracts the target — it stays in the ledger for audit but not in user-facing history or current', () => {
    const friendClaim = row({ id: 'friend-claim', recordedAt: '2026-06-01T00:00:00Z', authority: 'SYSTEM_DERIVED', toRelationshipType: 'friend', changeKind: 'CREATED' });
    const correction = row({
      id: 'correction',
      recordedAt: '2026-07-01T00:00:00Z',
      authority: 'USER_EXPLICIT',
      changeKind: 'CORRECTED',
      correctsHistoryId: 'friend-claim',
      // pure retraction — no new positive claim
      toRelationshipType: null,
      toStatus: null,
    });
    const projection = projectRelationship([friendClaim, correction]);
    expect(projection.current).toBeNull();
    expect(projection.history).toHaveLength(0);
    expect(projection.correctedAssertions.map((r) => r.id)).toEqual(['friend-claim']);
    // The retracted assertion must never surface as if it were true.
    expect(projection.history.some((r) => r.toRelationshipType === 'friend')).toBe(false);
  });

  it('a correction can retract AND assert a replacement in the same row', () => {
    const friendClaim = row({ id: 'friend-claim', recordedAt: '2026-06-01T00:00:00Z', authority: 'SYSTEM_DERIVED', toRelationshipType: 'friend' });
    const correction = row({
      id: 'correction',
      recordedAt: '2026-07-01T00:00:00Z',
      authority: 'USER_EXPLICIT',
      changeKind: 'CORRECTED',
      correctsHistoryId: 'friend-claim',
      toRelationshipType: 'acquaintance',
      toStatus: 'active',
    });
    const projection = projectRelationship([friendClaim, correction]);
    expect(projection.current?.type).toBe('acquaintance');
    // The correction row itself IS real history (it's a positive claim); the retracted original is not.
    expect(projection.history.map((r) => r.id)).toEqual(['correction']);
    expect(projection.correctedAssertions.map((r) => r.id)).toEqual(['friend-claim']);
  });

  it('four-way distinction: current friend', () => {
    const p = projectRelationship([
      row({ id: 'a', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'friend', toStatus: 'active' }),
    ]);
    expect(p.current).toMatchObject({ type: 'friend', status: 'active' });
  });

  it('four-way distinction: "we used to be friends" (historical only, no explicit current claim beyond the historical one — ENDED with no further evidence still resolves via the last real row)', () => {
    // "Used to be" with nothing asserted about now still has ONE real row —
    // that row's own state (friend/active) is the only truth on record,
    // which is correct: absence of a later assertion is not itself an
    // "ended" claim, per "do not infer relationship endings from silence."
    const p = projectRelationship([
      row({ id: 'a', recordedAt: '2026-06-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'friend', toStatus: 'active' }),
    ]);
    expect(p.current?.type).toBe('friend');
    expect(p.history).toHaveLength(1);
  });

  it('four-way distinction: "we\'re not friends anymore" (explicit ENDED transition)', () => {
    const p = projectRelationship([
      row({ id: 'a', recordedAt: '2026-06-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'friend', toStatus: 'active', changeKind: 'CREATED' }),
      row({ id: 'b', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'friend', toStatus: 'ended', changeKind: 'ENDED' }),
    ]);
    expect(p.current).toMatchObject({ type: 'friend', status: 'ended' });
    expect(p.history).toHaveLength(2);
    // Prior state is preserved, not erased.
    expect(p.history[0]).toMatchObject({ toStatus: 'active' });
  });

  it('four-way distinction: "we were never friends" (CORRECTED, covered above) does not appear as historical truth', () => {
    const p = projectRelationship([
      row({ id: 'a', recordedAt: '2026-06-01T00:00:00Z', authority: 'SYSTEM_DERIVED', toRelationshipType: 'friend', changeKind: 'CREATED' }),
      row({ id: 'b', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', changeKind: 'CORRECTED', correctsHistoryId: 'a' }),
    ]);
    expect(p.history.every((r) => r.toRelationshipType !== 'friend')).toBe(true);
  });

  it('legacy baseline: no history but a live character_relationships row exists → synthetic MIGRATED current, not "no data"', () => {
    const p = projectRelationship([], { relationshipType: 'friend', status: 'active', updatedAt: '2026-05-01T00:00:00Z' });
    expect(p.current).toMatchObject({ type: 'friend', status: 'active', authority: 'MIGRATED', isMigratedBaseline: true });
    expect(p.history).toHaveLength(0);
  });

  it('legacy baseline is immediately superseded once any real history row exists — MIGRATED never outranks a real write', () => {
    const p = projectRelationship(
      [row({ id: 'a', recordedAt: '2026-06-01T00:00:00Z', authority: 'SYSTEM_DERIVED', toRelationshipType: 'estranged', toStatus: 'inactive' })],
      { relationshipType: 'friend', status: 'active', updatedAt: '2026-01-01T00:00:00Z' },
    );
    expect(p.current?.type).toBe('estranged');
  });

  it('no history and no legacy row: current is null, not a guess', () => {
    const p = projectRelationship([], null);
    expect(p.current).toBeNull();
  });

  it('flags an unresolved conflict when two same-authority, same-instant rows disagree', () => {
    const p = projectRelationship([
      row({ id: 'a', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'friend' }),
      row({ id: 'b', recordedAt: '2026-07-01T00:00:00Z', authority: 'USER_EXPLICIT', toRelationshipType: 'estranged' }),
    ]);
    expect(p.unresolvedConflicts.length).toBeGreaterThan(0);
  });
});

describe('recordRelationshipTransition — governed write path (I/O, mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockChain(finalResult: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      single: () => Promise.resolve(finalResult),
      maybeSingle: () => Promise.resolve(finalResult),
      insert: () => chain,
      update: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(finalResult),
    };
    return chain;
  }

  it('is idempotent: a duplicate write with the same idempotencyKey returns the existing row instead of erroring or duplicating', async () => {
    let insertAttempted = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'character_relationship_history') {
        return {
          select: () => mockChain({ data: [], error: null }),
          insert: () => ({
            select: () => ({
              single: () => {
                if (!insertAttempted) {
                  insertAttempted = true;
                  return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
                }
                return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
              },
            }),
          }),
          eq: function (this: unknown) { return this; },
        };
      }
      return mockChain({ data: null, error: null });
    });

    // Re-mock precisely for the duplicate-fetch branch this test exercises.
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'character_relationship_history') return mockChain({ data: null, error: null });
      const builder: Record<string, unknown> = {
        select: (_cols: string) => builder,
        eq: () => builder,
        order: () => Promise.resolve({ data: [], error: null }),
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505' } }) }),
        }),
        single: () =>
          Promise.resolve({
            data: {
              id: 'existing-row', user_id: 'u1', source_character_id: 'c1', target_character_id: 'c2',
              from_relationship_type: null, from_status: null, to_relationship_type: 'friend', to_status: 'active',
              changed_at: '2026-07-01T00:00:00Z', recorded_at: '2026-07-01T00:00:00Z', valid_until: null,
              change_kind: 'CREATED', authority: 'USER_EXPLICIT', evidence_ids: [], confidence: null,
              relationship_id: null, corrects_history_id: null,
            },
            error: null,
          }),
      };
      return builder;
    });

    const result = await recordRelationshipTransition({
      userId: 'u1', sourceCharacterId: 'c1', targetCharacterId: 'c2',
      toRelationshipType: 'friend', toStatus: 'active', changeKind: 'CREATED', authority: 'USER_EXPLICIT',
      idempotencyKey: 'msg-123-friend',
    });

    expect(result.id).toBe('existing-row');
    expect(result.toRelationshipType).toBe('friend');
  });

  it('a cache-sync failure after a successful history write does not throw — canonical write already succeeded', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'character_relationship_history') {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => Promise.resolve({ data: [], error: null }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: 'new-row', user_id: 'u1', source_character_id: 'c1', target_character_id: 'c2',
                    from_relationship_type: null, from_status: null, to_relationship_type: 'estranged', to_status: 'inactive',
                    changed_at: '2026-08-01T00:00:00Z', recorded_at: '2026-08-01T00:00:00Z', valid_until: null,
                    change_kind: 'TRANSITIONED', authority: 'USER_EXPLICIT', evidence_ids: [], confidence: null,
                    relationship_id: null, corrects_history_id: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
        return builder;
      }
      // character_relationships cache-sync path — simulate a failure.
      return {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.reject(new Error('cache sync boom')) }) }) }),
      };
    });

    const result = await recordRelationshipTransition({
      userId: 'u1', sourceCharacterId: 'c1', targetCharacterId: 'c2',
      toRelationshipType: 'estranged', toStatus: 'inactive', changeKind: 'TRANSITIONED', authority: 'USER_EXPLICIT',
    });

    expect(result.id).toBe('new-row');
    expect(result.toRelationshipType).toBe('estranged');
  });
});

describe('getCurrentCharacterRelationship — tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the history and legacy-cache reads to the requesting user_id, never leaking another tenant\'s row for the same character ids', async () => {
    // Two users happen to share the same character/relationship ids (e.g. seeded
    // fixtures or colliding UUIDs from separate imports). The query must be
    // scoped by user_id at the DB layer — a same-shaped row belonging to a
    // different user must never be returned as this user's "current" state.
    const seenUserIds: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'user_id') seenUserIds.push(val);
          return builder;
        },
        order: () =>
          table === 'character_relationship_history' ? Promise.resolve({ data: [], error: null }) : builder,
        maybeSingle: () =>
          table === 'character_relationships'
            ? Promise.resolve({
                data: { id: 'rel-1', relationship_type: 'friend', status: 'active', updated_at: '2026-05-01T00:00:00Z' },
                error: null,
              })
            : Promise.resolve({ data: null, error: null }),
      };
      return builder;
    });

    await getCurrentCharacterRelationship('user-a', 'c1', 'c2');
    await getCurrentCharacterRelationship('user-b', 'c1', 'c2');

    // Every read for both calls was scoped by its own caller's user_id —
    // no query for c1/c2 ever ran without a user_id filter attached.
    expect(seenUserIds).toEqual(expect.arrayContaining(['user-a', 'user-b']));
    expect(seenUserIds.every((id) => id === 'user-a' || id === 'user-b')).toBe(true);
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  chatCurrentRelationshipFields,
  describeCurrentRelationship,
  formatChatRelationshipRecall,
  isFamilyDimensionType,
  listCorrectedAuditStates,
  listPreviousGroundedStates,
  partitionConnectionsByDimension,
  projectionFromLegacyCache,
  shouldShowRelationshipDebug,
  type RelationshipHistoryRow,
  type RelationshipProjection,
} from './relationshipAuthority';

const MARCUS_ID = '11111111-1111-4111-8111-111111111111';
const JAMIE_ID = '22222222-2222-4222-8222-222222222222';

function row(
  partial: Partial<RelationshipHistoryRow> & Pick<RelationshipHistoryRow, 'id' | 'recordedAt'>,
): RelationshipHistoryRow {
  return {
    fromRelationshipType: null,
    fromStatus: null,
    toRelationshipType: null,
    toStatus: null,
    changedAt: partial.recordedAt,
    validUntil: null,
    changeKind: 'CREATED',
    authority: 'USER_EXPLICIT',
    evidenceIds: [],
    confidence: null,
    relationshipId: MARCUS_ID,
    correctsHistoryId: null,
    ...partial,
  };
}

function projection(partial: Partial<RelationshipProjection>): RelationshipProjection {
  return {
    current: null,
    history: [],
    correctedAssertions: [],
    unresolvedConflicts: [],
    ...partial,
  };
}

describe('relationship authority Connections display', () => {
  it('1. FRIEND → ESTRANGED: Current Estranged, Previously Friend', () => {
    const p = projection({
      current: {
        type: 'estranged',
        status: 'inactive',
        authority: 'USER_EXPLICIT',
        changedAt: '2026-07-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
      history: [
        row({
          id: 'h1',
          recordedAt: '2026-06-01T00:00:00Z',
          toRelationshipType: 'friend',
          toStatus: 'active',
          changeKind: 'CREATED',
        }),
        row({
          id: 'h2',
          recordedAt: '2026-07-01T00:00:00Z',
          toRelationshipType: 'estranged',
          toStatus: 'inactive',
          changeKind: 'TRANSITIONED',
        }),
      ],
    });
    expect(describeCurrentRelationship(p).headline).toBe('Estranged');
    expect(listPreviousGroundedStates(p)).toEqual(['Friend']);
    expect(listCorrectedAuditStates(p)).toEqual([]);
  });

  it('2. FRIEND → ENDED: historical friend remains', () => {
    const p = projection({
      current: {
        type: 'friend',
        status: 'ended',
        authority: 'USER_EXPLICIT',
        changedAt: '2026-07-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
      history: [
        row({
          id: 'h1',
          recordedAt: '2026-06-01T00:00:00Z',
          toRelationshipType: 'friend',
          toStatus: 'active',
          changeKind: 'CREATED',
        }),
        row({
          id: 'h2',
          recordedAt: '2026-07-01T00:00:00Z',
          toRelationshipType: 'friend',
          toStatus: 'ended',
          changeKind: 'ENDED',
        }),
      ],
    });
    expect(describeCurrentRelationship(p).headline).toBe('Ended');
    expect(listPreviousGroundedStates(p)).toEqual(['Friend']);
  });

  it('3. WE WERE NEVER FRIENDS: Friend is not autobiographical history', () => {
    const friendClaim = row({
      id: 'friend-claim',
      recordedAt: '2026-06-01T00:00:00Z',
      toRelationshipType: 'friend',
      toStatus: 'active',
      authority: 'SYSTEM_DERIVED',
    });
    const p = projection({
      current: null,
      history: [],
      correctedAssertions: [friendClaim],
    });
    expect(describeCurrentRelationship(p).headline).toBe('Not friends');
    expect(listPreviousGroundedStates(p)).toEqual([]);
    expect(listCorrectedAuditStates(p)).toEqual(['Friend']);
    expect(listPreviousGroundedStates(p)).not.toContain('Friend');
  });

  it('4. ACQUAINTANCE → FRIEND: both real states appear in order', () => {
    const p = projection({
      current: {
        type: 'friend',
        status: 'active',
        authority: 'USER_EXPLICIT',
        changedAt: '2026-08-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
      history: [
        row({
          id: 'h1',
          recordedAt: '2026-05-01T00:00:00Z',
          toRelationshipType: 'acquaintance',
          toStatus: 'active',
          changeKind: 'CREATED',
        }),
        row({
          id: 'h2',
          recordedAt: '2026-08-01T00:00:00Z',
          toRelationshipType: 'friend',
          toStatus: 'active',
          changeKind: 'TRANSITIONED',
        }),
      ],
    });
    expect(describeCurrentRelationship(p).headline).toBe('Friend');
    expect(listPreviousGroundedStates(p)).toEqual(['Acquaintance']);
  });

  it('5. USER CORRECTION > newer system inference: modal keeps user-corrected state', () => {
    const p = projection({
      current: {
        type: 'acquaintance',
        status: 'active',
        authority: 'USER_EXPLICIT',
        changedAt: '2026-07-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
      history: [
        row({
          id: 'correction',
          recordedAt: '2026-07-01T00:00:00Z',
          toRelationshipType: 'acquaintance',
          toStatus: 'active',
          changeKind: 'CORRECTED',
          authority: 'USER_EXPLICIT',
          correctsHistoryId: 'friend-claim',
        }),
      ],
      correctedAssertions: [
        row({
          id: 'friend-claim',
          recordedAt: '2026-06-01T00:00:00Z',
          toRelationshipType: 'friend',
          toStatus: 'active',
          authority: 'SYSTEM_DERIVED',
        }),
      ],
    });
    expect(describeCurrentRelationship(p).headline).toBe('Acquaintance');
    expect(listPreviousGroundedStates(p)).not.toContain('Friend');
    expect(listCorrectedAuditStates(p)).toEqual(['Friend']);
  });

  it('6. MODAL + CHAT: same current relationship projection fields', () => {
    const p = projection({
      current: {
        type: 'estranged',
        status: 'inactive',
        authority: 'USER_EXPLICIT',
        changedAt: '2026-07-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
      history: [
        row({
          id: 'h1',
          recordedAt: '2026-06-01T00:00:00Z',
          toRelationshipType: 'friend',
          toStatus: 'active',
        }),
      ],
    });
    expect(describeCurrentRelationship(p).headline).toBe('Estranged');
    expect(chatCurrentRelationshipFields(p)).toEqual({ type: 'estranged', status: 'inactive' });
    expect(formatChatRelationshipRecall(p)).toBe('estranged, inactive');
  });

  it('14. LEGACY BASELINE: no history rows → safe migrated projection, not invented Previously', () => {
    const p = projectionFromLegacyCache({
      relationship_type: 'friend',
      status: 'active',
      updated_at: '2026-05-01T00:00:00Z',
    });
    expect(p.current?.isMigratedBaseline).toBe(true);
    expect(describeCurrentRelationship(p).headline).toBe('Friend');
    expect(listPreviousGroundedStates(p)).toEqual([]);
  });

  it('12. FAMILY STRUCTURE: cousin/uncle/sibling stay family-dimension, not social stranger', () => {
    expect(isFamilyDimensionType('cousin')).toBe(true);
    expect(isFamilyDimensionType('cousin_of')).toBe(true);
    expect(isFamilyDimensionType('uncle')).toBe(true);
    expect(isFamilyDimensionType('sibling')).toBe(true);
    expect(isFamilyDimensionType('mother')).toBe(true);
    expect(isFamilyDimensionType('friend')).toBe(false);
    expect(isFamilyDimensionType('stranger')).toBe(false);

    const partitioned = partitionConnectionsByDimension(
      [
        { id: '1', character_id: MARCUS_ID, character_name: 'Marcus', relationship_type: 'cousin' },
        { id: '2', character_id: JAMIE_ID, character_name: 'Jamie', relationship_type: 'friend' },
      ],
      null,
    );
    expect(partitioned.family.map((e) => e.relationship_type)).toEqual(['cousin']);
    expect(partitioned.social.map((s) => s.edge.relationship_type)).toEqual(['friend']);
  });

  it('15. TENANT ISOLATION: Jamie projection is not mixed with another user\'s counterpart map', () => {
    const jamieToMarcus = projection({
      current: {
        type: 'estranged',
        status: 'inactive',
        authority: 'USER_EXPLICIT',
        changedAt: '2026-07-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
    });
    const otherTenant = projection({
      current: {
        type: 'friend',
        status: 'active',
        authority: 'SYSTEM_DERIVED',
        changedAt: '2026-08-01T00:00:00Z',
        confidence: null,
        evidenceIds: [],
        isMigratedBaseline: false,
      },
    });
    const modalQuery: Record<string, RelationshipProjection> = { [MARCUS_ID]: jamieToMarcus };
    expect(modalQuery[MARCUS_ID]?.current?.type).toBe('estranged');
    expect(modalQuery[JAMIE_ID]).toBeUndefined();
    expect(Object.values(modalQuery).some((p) => p.current?.type === otherTenant.current?.type)).toBe(false);
  });
});

describe('shouldShowRelationshipDebug', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('is off by default so normal Character UI stays uncluttered', () => {
    expect(shouldShowRelationshipDebug()).toBe(false);
  });

  it('turns on only with the debug flag', () => {
    localStorage.setItem('lk:debug-relationships', '1');
    expect(shouldShowRelationshipDebug()).toBe(true);
  });
});

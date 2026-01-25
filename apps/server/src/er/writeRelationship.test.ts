import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeRelationship } from './writeRelationship';
import { supabaseAdmin } from '../services/supabaseClient';
import { upsertTemporalRelationship, writeRelationshipSnapshot } from './temporalEdgeService';

vi.mock('../services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./temporalEdgeService', () => ({
  upsertTemporalRelationship: vi.fn().mockResolvedValue({
    id: 'te-1',
    kind: 'ASSERTED',
    confidence: 0.8,
    last_evidence_at: new Date().toISOString(),
    evidence_source_ids: [],
    phase: 'ACTIVE',
  }),
  writeRelationshipSnapshot: vi.fn().mockResolvedValue(undefined),
}));

describe('writeRelationship', () => {
  let mockFrom: any;
  let mockInsert: any;
  let mockUpsert: any;
  let mockSelect: any;
  let mockEq: any;
  let mockSingle: any;
  let mockUpdate: any;

  const resolvedMap = new Map([
    ['char-a', { id: 'char-a', type: 'PERSON' as const }],
    ['char-b', { id: 'char-b', type: 'PERSON' as const }],
    ['ent-1', { id: 'ent-1', type: 'ORG' as const }],
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mockSingle }) });
    mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === 'entity_relationships') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        is: vi.fn().mockReturnValue({ single: mockSingle }),
                        eq: vi.fn().mockReturnValue({ single: mockSingle }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: mockInsert,
          update: mockUpdate,
        };
      }
      return {
        insert: mockInsert,
        upsert: mockUpsert,
      };
    });
    (supabaseAdmin.from as any) = mockFrom;
  });

  it('writes to character_relationships with correct shape for PERSON,PERSON FRIEND_OF', async () => {
    const rel = {
      fromTempId: 'char-a',
      toTempId: 'char-b',
      relationship: 'FRIEND_OF' as const,
      kind: 'ASSERTED' as const,
      confidence: 0.8,
    };
    await writeRelationship('user-1', 'character_relationships', rel, resolvedMap, { userId: 'user-1' });

    expect(mockFrom).toHaveBeenCalledWith('character_relationships');
    expect(mockUpsert).toHaveBeenCalled();
    const upsertArg = (mockUpsert as any).mock.calls[0][0];
    expect(upsertArg.user_id).toBe('user-1');
    expect(upsertArg.source_character_id).toBe('char-a');
    expect(upsertArg.target_character_id).toBe('char-b');
    expect(upsertArg.relationship_type).toBe('FRIEND_OF');
    expect(typeof upsertArg.closeness_score).toBe('number');
    expect(upsertArg.updated_at).toBeDefined();
    expect(upsertTemporalRelationship).toHaveBeenCalledWith(
      'user-1', 'char-a', 'char-b', 'character', 'character', 'FRIEND_OF', 'ASSERTED', 0.8,
      'global', { userId: 'user-1' }, []
    );
    expect(writeRelationshipSnapshot).toHaveBeenCalledWith(expect.objectContaining({ id: 'te-1' }), 'global');
  });

  it('passes ctx.scope to upsertTemporalRelationship and writeRelationshipSnapshot', async () => {
    const rel = {
      fromTempId: 'char-a',
      toTempId: 'char-b',
      relationship: 'FRIEND_OF' as const,
      kind: 'ASSERTED' as const,
      confidence: 0.8,
    };
    await writeRelationship('user-1', 'character_relationships', rel, resolvedMap, { userId: 'user-1', scope: 'work' });

    expect(upsertTemporalRelationship).toHaveBeenCalledWith(
      'user-1', 'char-a', 'char-b', 'character', 'character', 'FRIEND_OF', 'ASSERTED', 0.8,
      'work', { userId: 'user-1', scope: 'work' }, []
    );
    expect(writeRelationshipSnapshot).toHaveBeenCalledWith(expect.objectContaining({ id: 'te-1' }), 'work');
  });

  it('writes to entity_relationships with correct shape for PERSON,ORG WORKS_FOR', async () => {
    const rel = {
      fromTempId: 'char-a',
      toTempId: 'ent-1',
      relationship: 'WORKS_FOR' as const,
      kind: 'ASSERTED' as const,
      confidence: 0.75,
    };
    await writeRelationship('user-1', 'entity_relationships', rel, resolvedMap, { userId: 'user-1' }, {
      scope: 'work',
      evidenceSourceIds: ['msg-1'],
      evidence: 'text',
    });

    expect(mockFrom).toHaveBeenCalledWith('entity_relationships');
    // On first call (existing check) it uses select; when no existing, it uses insert
    expect(mockInsert).toHaveBeenCalled();
    const insertArg = (mockInsert as any).mock.calls[0][0];
    expect(insertArg.user_id).toBe('user-1');
    expect(insertArg.from_entity_id).toBe('char-a');
    expect(insertArg.from_entity_type).toBe('character');
    expect(insertArg.to_entity_id).toBe('ent-1');
    expect(insertArg.to_entity_type).toBe('omega_entity');
    expect(insertArg.relationship_type).toBe('WORKS_FOR');
    expect(insertArg.scope).toBe('work');
    expect(insertArg.confidence).toBe(0.75);
    expect(Array.isArray(insertArg.evidence_source_ids)).toBe(true);
    expect(insertArg.evidence_source_ids).toContain('msg-1');
    expect(upsertTemporalRelationship).toHaveBeenCalledWith(
      'user-1', 'char-a', 'ent-1', 'character', 'omega_entity', 'WORKS_FOR', 'ASSERTED', 0.75,
      'global', { userId: 'user-1' }, ['msg-1']
    );
    expect(writeRelationshipSnapshot).toHaveBeenCalledWith(expect.objectContaining({ id: 'te-1' }), 'global');
  });

  it('skips event_mentions when memoryId is missing', async () => {
    const rel = {
      fromTempId: 'char-a',
      toTempId: 'ev-1',
      relationship: 'PARTICIPATED_IN' as const,
      kind: 'EPISODIC' as const,
      confidence: 0.7,
    };
    const res = new Map([
      ['char-a', { id: 'char-a', type: 'PERSON' as const }],
      ['ev-1', { id: 'ev-1', type: 'EVENT' as const }],
    ]);
    await writeRelationship('user-1', 'event_mentions', rel, res, { userId: 'user-1' });

    expect(mockFrom).not.toHaveBeenCalledWith('event_mentions');
    // writeRelationship no-ops and returns without calling insert when memoryId is missing
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('writes to event_mentions when memoryId is provided', async () => {
    const rel = {
      fromTempId: 'char-a',
      toTempId: 'ev-1',
      relationship: 'PARTICIPATED_IN' as const,
      kind: 'EPISODIC' as const,
      confidence: 0.7,
    };
    const res = new Map([
      ['char-a', { id: 'char-a', type: 'PERSON' as const }],
      ['ev-1', { id: 'ev-1', type: 'EVENT' as const }],
    ]);
    await writeRelationship('user-1', 'event_mentions', rel, res, {
      userId: 'user-1',
      memoryId: 'je-123',
    });

    expect(mockFrom).toHaveBeenCalledWith('event_mentions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'ev-1',
        memory_id: 'je-123',
        signal: {},
      })
    );
    expect(upsertTemporalRelationship).not.toHaveBeenCalled();
    expect(writeRelationshipSnapshot).not.toHaveBeenCalled();
  });
});

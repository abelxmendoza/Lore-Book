import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeRelationshipStrength,
  detectRelationshipPhase,
  inferStartTime,
  findActiveEdge,
  upsertTemporalRelationship,
  writeRelationshipSnapshot,
  closeEpisodicEdges,
  getEpisodicClosureDays,
} from './temporalEdgeService';
import { supabaseAdmin } from '../services/supabaseClient';

vi.mock('../services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

describe('temporalEdgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeRelationshipStrength', () => {
    it('returns 0–1 from frequency, recency, confidence', () => {
      const edge = {
        evidence_source_ids: ['a', 'b', 'c'] as string[],
        last_evidence_at: new Date().toISOString(),
        confidence: 0.9,
      };
      const s = computeRelationshipStrength(edge);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });

    it('caps frequency from evidence count', () => {
      const edge = {
        evidence_source_ids: Array(20).fill('x'),
        last_evidence_at: new Date().toISOString(),
        confidence: 0.5,
      };
      const s = computeRelationshipStrength(edge);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });

    it('handles empty evidence_source_ids', () => {
      const edge = {
        evidence_source_ids: [],
        last_evidence_at: new Date().toISOString(),
        confidence: 0.8,
      };
      const s = computeRelationshipStrength(edge);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  describe('detectRelationshipPhase', () => {
    it('returns EVENT for EPISODIC kind', () => {
      expect(
        detectRelationshipPhase({
          id: 'e',
          kind: 'EPISODIC',
          confidence: 0.5,
          last_evidence_at: new Date().toISOString(),
          evidence_source_ids: [],
        })
      ).toBe('EVENT');
    });

    it('returns CORE when strength > 0.8', () => {
      expect(
        detectRelationshipPhase({
          id: 'e',
          kind: 'ASSERTED',
          confidence: 0.95,
          last_evidence_at: new Date().toISOString(),
          evidence_source_ids: Array(15).fill('x'),
        })
      ).toBe('CORE');
    });

    it('returns DORMANT when strength is low', () => {
      expect(
        detectRelationshipPhase({
          id: 'e',
          kind: 'ASSERTED',
          confidence: 0.1,
          last_evidence_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
          evidence_source_ids: [],
        })
      ).toBe('DORMANT');
    });
  });

  describe('inferStartTime', () => {
    it('returns null when ctx.memoryId is missing', async () => {
      expect(await inferStartTime({})).toBeNull();
    });

    it('returns journal_entries.date when found', async () => {
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { date: '2025-01-15T12:00:00Z' }, error: null }) }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await inferStartTime({ memoryId: 'je-1' })).toBe('2025-01-15T12:00:00Z');
      expect(from).toHaveBeenCalledWith('journal_entries');
    });

    it('falls back to chat_messages.created_at when journal not found', async () => {
      let callCount = 0;
      const from = vi.fn((table: string) => {
        callCount++;
        if (table === 'journal_entries') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
            }),
          };
        }
        if (table === 'chat_messages') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { created_at: '2025-01-10T08:00:00Z' }, error: null }) }),
            }),
          };
        }
        return {};
      });
      (supabaseAdmin.from as any) = from;
      expect(await inferStartTime({ memoryId: 'msg-1' })).toBe('2025-01-10T08:00:00Z');
      expect(from).toHaveBeenCalledWith('journal_entries');
      expect(from).toHaveBeenCalledWith('chat_messages');
    });

    it('returns null when neither journal nor chat found', async () => {
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await inferStartTime({ memoryId: 'unknown' })).toBeNull();
    });
  });

  describe('findActiveEdge', () => {
    it('returns null when no row', async () => {
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
                }),
              }),
            }),
          }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await findActiveEdge('u1', 'a', 'b', 'FRIEND_OF')).toBeNull();
      expect(from).toHaveBeenCalledWith('temporal_edges');
    });

    it('returns row when found', async () => {
      const row = { id: 'te-1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: '2025-01-01', evidence_source_ids: [] };
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) }),
                }),
              }),
            }),
          }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await findActiveEdge('u1', 'a', 'b', 'FRIEND_OF')).toEqual(row);
    });
  });

  describe('upsertTemporalRelationship', () => {
    it('inserts when no existing edge', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: 'x', evidence_source_ids: [] }, error: null }) }),
      });
      const from = vi.fn((table: string) => {
        if (table === 'temporal_edges') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
                  }),
                }),
              }),
            }),
            insert: mockInsert,
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }) }),
          };
        }
        return {};
      });
      (supabaseAdmin.from as any) = from;

      const edge = await upsertTemporalRelationship(
        'u1', 'a', 'b', 'character', 'character', 'FRIEND_OF', 'ASSERTED', 0.8, { memoryId: undefined }, []
      );
      expect(edge).not.toBeNull();
      expect(edge!.id).toBe('new-1');
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('writeRelationshipSnapshot', () => {
    it('calls upsert on relationship_snapshots', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null });
      const from = vi.fn(() => ({ upsert }));
      (supabaseAdmin.from as any) = from;

      await writeRelationshipSnapshot({
        id: 'te-1',
        kind: 'ASSERTED',
        confidence: 0.8,
        last_evidence_at: new Date().toISOString(),
        evidence_source_ids: [],
      });
      expect(from).toHaveBeenCalledWith('relationship_snapshots');
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship_id: 'te-1',
          confidence: 0.8,
          phase: expect.any(String),
        }),
        { onConflict: 'relationship_id' }
      );
    });
  });

  describe('closeEpisodicEdges', () => {
    it('returns 0 when no edges to close', async () => {
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await closeEpisodicEdges('u1')).toBe(0);
      expect(from).toHaveBeenCalledWith('temporal_edges');
    });

    it('updates and returns count when edges found', async () => {
      const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const from = vi.fn((table: string) => {
        if (table === 'temporal_edges') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    lt: vi.fn().mockResolvedValue({
                      data: [
                        { id: 'e1', last_evidence_at: '2024-01-01' },
                        { id: 'e2', last_evidence_at: '2024-01-02' },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update,
          };
        }
        return {};
      });
      (supabaseAdmin.from as any) = from;
      const closed = await closeEpisodicEdges('u1');
      expect(closed).toBe(2);
      expect(update).toHaveBeenCalledTimes(2);
    });
  });

  describe('getEpisodicClosureDays', () => {
    it('returns number from env or 90', () => {
      const n = getEpisodicClosureDays();
      expect(typeof n).toBe('number');
      expect(n).toBeGreaterThanOrEqual(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeRelationshipStrength,
  determinePhase,
  inferStartTime,
  findActiveEdge,
  upsertTemporalRelationship,
  writeRelationshipSnapshot,
  updateTemporalEdge,
  fetchActiveTemporalEdges,
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
    it('returns 0–1 from recency and confidence (Phase 3.1 formula)', () => {
      const edge = { last_evidence_at: new Date().toISOString(), confidence: 0.9 };
      const s = computeRelationshipStrength(edge);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });

    it('gives high strength when recent and high confidence', () => {
      const edge = { last_evidence_at: new Date().toISOString(), confidence: 1 };
      const s = computeRelationshipStrength(edge);
      expect(s).toBeGreaterThan(0.9);
    });

    it('gives low strength when very old and low confidence', () => {
      const edge = {
        last_evidence_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        confidence: 0.1,
      };
      const s = computeRelationshipStrength(edge);
      expect(s).toBeLessThan(0.2);
    });
  });

  describe('determinePhase', () => {
    it('returns CORE when strength >= 0.8', () => {
      expect(determinePhase(0.8)).toBe('CORE');
      expect(determinePhase(0.95)).toBe('CORE');
    });

    it('returns ACTIVE when strength >= 0.55 and < 0.8', () => {
      expect(determinePhase(0.55)).toBe('ACTIVE');
      expect(determinePhase(0.7)).toBe('ACTIVE');
    });

    it('returns WEAK when strength >= 0.3 and < 0.55', () => {
      expect(determinePhase(0.3)).toBe('WEAK');
      expect(determinePhase(0.4)).toBe('WEAK');
    });

    it('returns DORMANT when strength < 0.3', () => {
      expect(determinePhase(0.2)).toBe('DORMANT');
      expect(determinePhase(0)).toBe('DORMANT');
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
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await findActiveEdge('u1', 'a', 'b', 'FRIEND_OF', 'global')).toBeNull();
      expect(from).toHaveBeenCalledWith('temporal_edges');
    });

    it('returns row when found', async () => {
      const row = { id: 'te-1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: '2025-01-01', evidence_source_ids: [], scope: 'work', phase: 'ACTIVE' };
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
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
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await findActiveEdge('u1', 'a', 'b', 'FRIEND_OF', 'work')).toEqual(row);
    });
  });

  describe('upsertTemporalRelationship', () => {
    it('inserts when no existing edge', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: 'x', evidence_source_ids: [], scope: 'global', phase: 'ACTIVE' }, error: null }) }),
      });
      const from = vi.fn((table: string) => {
        if (table === 'temporal_edges') {
          return {
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
            insert: mockInsert,
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }) }),
          };
        }
        return {};
      });
      (supabaseAdmin.from as any) = from;

      const edge = await upsertTemporalRelationship(
        'u1', 'a', 'b', 'character', 'character', 'FRIEND_OF', 'ASSERTED', 0.8, 'global', { memoryId: undefined }, []
      );
      expect(edge).not.toBeNull();
      expect(edge!.id).toBe('new-1');
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'global', phase: expect.any(String) }));
    });

    it('same (from, to, type) with different scope yields two inserts', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: 'x', evidence_source_ids: [], scope: 'work', phase: 'ACTIVE' }, error: null }) }),
      });
      const from = vi.fn((table: string) => {
        if (table === 'temporal_edges') {
          return {
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
            insert: mockInsert,
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }) }),
          };
        }
        return {};
      });
      (supabaseAdmin.from as any) = from;

      await upsertTemporalRelationship('u1', 'a', 'b', 'character', 'character', 'FRIEND_OF', 'ASSERTED', 0.8, 'work', {}, []);
      await upsertTemporalRelationship('u1', 'a', 'b', 'character', 'character', 'FRIEND_OF', 'ASSERTED', 0.8, 'family', {}, []);

      expect(mockInsert).toHaveBeenCalledTimes(2);
      expect(mockInsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ scope: 'work' }));
      expect(mockInsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ scope: 'family' }));
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
        phase: 'ACTIVE',
      });
      expect(from).toHaveBeenCalledWith('relationship_snapshots');
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship_id: 'te-1',
          confidence: 0.8,
          phase: expect.any(String),
          scope: 'global',
        }),
        { onConflict: 'relationship_id' }
      );
    });

    it('uses scopeOverride when provided', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null });
      const from = vi.fn(() => ({ upsert }));
      (supabaseAdmin.from as any) = from;

      await writeRelationshipSnapshot(
        { id: 'te-1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: new Date().toISOString(), evidence_source_ids: [], phase: 'CORE' },
        'work'
      );
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ relationship_id: 'te-1', scope: 'work' }),
        { onConflict: 'relationship_id' }
      );
    });
  });

  describe('updateTemporalEdge', () => {
    it('updates phase, active, and end_time', async () => {
      const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const from = vi.fn(() => ({ update }));
      (supabaseAdmin.from as any) = from;

      await updateTemporalEdge('e1', { phase: 'ENDED', active: false, end_time: '2025-01-15T00:00:00Z' });
      expect(from).toHaveBeenCalledWith('temporal_edges');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'ENDED', active: false, end_time: '2025-01-15T00:00:00Z', updated_at: expect.any(String) })
      );
    });
  });

  describe('fetchActiveTemporalEdges', () => {
    it('returns edges when userId provided', async () => {
      const rows = [{ id: 'e1', kind: 'ASSERTED', confidence: 0.8, last_evidence_at: '2025-01-01', evidence_source_ids: [], scope: 'work', phase: 'ACTIVE' }];
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: rows, error: null }) }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      const result = await fetchActiveTemporalEdges('u1');
      expect(result).toHaveLength(1);
      expect(result[0].phase).toBe('ACTIVE');
      expect(from).toHaveBeenCalledWith('temporal_edges');
    });

    it('returns empty when no edges', async () => {
      const from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }),
      }));
      (supabaseAdmin.from as any) = from;
      expect(await fetchActiveTemporalEdges('u1')).toEqual([]);
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

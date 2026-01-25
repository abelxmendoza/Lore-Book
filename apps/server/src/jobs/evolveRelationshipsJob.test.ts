import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evolveRelationshipsJob } from './evolveRelationshipsJob';
import * as temporalEdgeService from '../er/temporalEdgeService';
import { supabaseAdmin } from '../services/supabaseClient';

vi.mock('../services/supabaseClient', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../er/temporalEdgeService', () => ({
  computeRelationshipStrength: vi.fn(),
  determinePhase: vi.fn(),
  updateTemporalEdge: vi.fn().mockResolvedValue(undefined),
  fetchActiveTemporalEdges: vi.fn(),
  writeRelationshipSnapshot: vi.fn().mockResolvedValue(undefined),
}));

describe('evolveRelationshipsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('evolveForUser', () => {
    it('updates edge and writes snapshot when phase changes', async () => {
      vi.mocked(temporalEdgeService.fetchActiveTemporalEdges).mockResolvedValue([
        {
          id: 'e1',
          kind: 'ASSERTED',
          confidence: 0.7,
          last_evidence_at: new Date().toISOString(),
          evidence_source_ids: [],
          scope: 'work',
          phase: 'ACTIVE',
        },
      ] as any);
      vi.mocked(temporalEdgeService.computeRelationshipStrength).mockReturnValue(0.85);
      vi.mocked(temporalEdgeService.determinePhase).mockReturnValue('CORE');

      const result = await (evolveRelationshipsJob as any).evolveForUser('u1');

      expect(result).toEqual({ updated: 1, ended: 0 });
      expect(temporalEdgeService.updateTemporalEdge).toHaveBeenCalledWith('e1', {
        phase: 'CORE',
        active: true,
        end_time: undefined,
      });
      expect(temporalEdgeService.writeRelationshipSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', phase: 'CORE' }),
        'work'
      );
    });

    it('sets ENDED and active=false for EPISODIC when nextPhase is DORMANT', async () => {
      vi.mocked(temporalEdgeService.fetchActiveTemporalEdges).mockResolvedValue([
        {
          id: 'e2',
          kind: 'EPISODIC',
          confidence: 0.2,
          last_evidence_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
          evidence_source_ids: [],
          scope: 'family',
          phase: 'WEAK',
        },
      ] as any);
      vi.mocked(temporalEdgeService.computeRelationshipStrength).mockReturnValue(0.2);
      vi.mocked(temporalEdgeService.determinePhase).mockReturnValue('DORMANT');

      const result = await (evolveRelationshipsJob as any).evolveForUser('u1');

      expect(result).toEqual({ updated: 1, ended: 1 });
      expect(temporalEdgeService.updateTemporalEdge).toHaveBeenCalledWith('e2', {
        phase: 'ENDED',
        active: false,
        end_time: expect.any(String),
      });
      expect(temporalEdgeService.writeRelationshipSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e2', phase: 'ENDED' }),
        'family'
      );
    });

    it('skips when phase unchanged', async () => {
      vi.mocked(temporalEdgeService.fetchActiveTemporalEdges).mockResolvedValue([
        { id: 'e3', kind: 'ASSERTED', confidence: 0.9, last_evidence_at: new Date().toISOString(), evidence_source_ids: [], scope: 'work', phase: 'CORE' },
      ] as any);
      vi.mocked(temporalEdgeService.computeRelationshipStrength).mockReturnValue(0.9);
      vi.mocked(temporalEdgeService.determinePhase).mockReturnValue('CORE');

      const result = await (evolveRelationshipsJob as any).evolveForUser('u1');

      expect(result).toEqual({ updated: 0, ended: 0 });
      expect(temporalEdgeService.updateTemporalEdge).not.toHaveBeenCalled();
      expect(temporalEdgeService.writeRelationshipSnapshot).not.toHaveBeenCalled();
    });
  });
});

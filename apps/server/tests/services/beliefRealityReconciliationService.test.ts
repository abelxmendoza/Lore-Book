import { describe, it, expect, vi, beforeEach } from 'vitest';
import { beliefRealityReconciliationService } from '../../src/services/beliefRealityReconciliationService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/services/embeddingService', () => ({
  embeddingService: { getEmbedding: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('BeliefRealityReconciliationService', () => {
  let mockFrom: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockEq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEq = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect, eq: vi.fn().mockReturnThis() });
    (supabaseAdmin as any).from = mockFrom;
  });

  describe('getResolutionsForUser', () => {
    it('returns empty array when no resolutions', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      mockEq.mockReturnValue({ order: mockOrder });

      const result = await beliefRealityReconciliationService.getResolutionsForUser('user-1');

      expect(result).toEqual([]);
      expect(mockFrom).toHaveBeenCalledWith('belief_resolutions');
    });

    it('returns resolutions when found', async () => {
      const resolutions = [{ id: 'r1', user_id: 'user-1', status: 'SUPPORTED' }];
      const mockOrder = vi.fn().mockResolvedValue({ data: resolutions, error: null });
      mockEq.mockReturnValue({ order: mockOrder });

      const result = await beliefRealityReconciliationService.getResolutionsForUser('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('SUPPORTED');
    });
  });

  describe('getResolutionForBelief', () => {
    it('returns null when not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      const mockEq2 = vi.fn().mockReturnValue({ single: mockSingle });
      mockEq.mockReturnValue({ eq: mockEq2 });
      (supabaseAdmin as any).from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) }),
      });

      const result = await beliefRealityReconciliationService.getResolutionForBelief(
        'user-1',
        'belief-1'
      );

      expect(result).toBeNull();
    });
  });
});

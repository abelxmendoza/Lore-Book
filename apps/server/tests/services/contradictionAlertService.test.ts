import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contradictionAlertService } from '../../src/services/contradictionAlertService';
import { beliefRealityReconciliationService } from '../../src/services/beliefRealityReconciliationService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/beliefRealityReconciliationService', () => ({
  beliefRealityReconciliationService: {
    getResolutionForBelief: vi.fn(),
  },
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('ContradictionAlertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(chain);
  });

  describe('shouldTriggerAlert', () => {
    it('returns false when no resolution', async () => {
      vi.mocked(beliefRealityReconciliationService.getResolutionForBelief).mockResolvedValue(null);

      const result = await contradictionAlertService.shouldTriggerAlert('user-1', 'belief-1');

      expect(result).toBe(false);
    });

    it('returns true when CONTRADICTED with low confidence', async () => {
      vi.mocked(beliefRealityReconciliationService.getResolutionForBelief).mockResolvedValue({
        status: 'CONTRADICTED',
        resolution_confidence: 0.3,
      } as any);

      const result = await contradictionAlertService.shouldTriggerAlert('user-1', 'belief-1');

      expect(result).toBe(true);
    });

    it('returns false when CONTRADICTED with high confidence', async () => {
      vi.mocked(beliefRealityReconciliationService.getResolutionForBelief).mockResolvedValue({
        status: 'CONTRADICTED',
        resolution_confidence: 0.8,
      } as any);

      const result = await contradictionAlertService.shouldTriggerAlert('user-1', 'belief-1');

      expect(result).toBe(false);
    });
  });

  describe('getActiveAlerts', () => {
    it('returns empty array when no alerts', async () => {
      const result = await contradictionAlertService.getActiveAlerts('user-1', 10);

      expect(result).toEqual([]);
    });
  });
});

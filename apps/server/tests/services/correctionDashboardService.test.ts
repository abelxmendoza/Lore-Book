import { describe, it, expect, vi, beforeEach } from 'vitest';
import { correctionDashboardService } from '../../src/services/correctionDashboardService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('CorrectionDashboardService', () => {
  const resolved = { data: [], error: null };

  beforeEach(() => {
    vi.clearAllMocks();
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(resolved);
    chain.single = vi.fn().mockResolvedValue(resolved);
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(chain);
  });

  describe('getCorrectionDashboardData', () => {
    it('returns corrections, deprecated_units, open_contradictions', async () => {
      const result = await correctionDashboardService.getCorrectionDashboardData('user-1');

      expect(result).toHaveProperty('corrections');
      expect(result).toHaveProperty('deprecated_units');
      expect(result).toHaveProperty('open_contradictions');
      expect(Array.isArray(result.corrections)).toBe(true);
      expect(Array.isArray(result.deprecated_units)).toBe(true);
      expect(Array.isArray(result.open_contradictions)).toBe(true);
    });
  });

  describe('listCorrectionRecords', () => {
    it('returns empty array when no records', async () => {
      const result = await correctionDashboardService.listCorrectionRecords('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('listDeprecatedUnits', () => {
    it('returns empty array when no deprecated units', async () => {
      const resolved = { data: [], error: null };
      (supabaseAdmin as any).from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(resolved),
              }),
            }),
          }),
        }),
      });

      const result = await correctionDashboardService.listDeprecatedUnits('user-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });
});

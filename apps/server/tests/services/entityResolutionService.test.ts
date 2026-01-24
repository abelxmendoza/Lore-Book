import { describe, it, expect, vi, beforeEach } from 'vitest';
import { entityResolutionService } from '../../src/services/entityResolutionService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/services/correctionDashboardService', () => ({
  correctionDashboardService: { recordCorrection: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('EntityResolutionService', () => {
  let mockFrom: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockEq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEq = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect, eq: mockEq, insert: vi.fn(), update: vi.fn() });
    (supabaseAdmin as any).from = mockFrom;
  });

  describe('getEntityResolutionDashboard', () => {
    it('returns dashboard with entities, conflicts, merge_history', async () => {
      const result = await entityResolutionService.getEntityResolutionDashboard('user-1');

      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('merge_history');
      expect(Array.isArray(result.entities)).toBe(true);
      expect(Array.isArray(result.conflicts)).toBe(true);
      expect(Array.isArray(result.merge_history)).toBe(true);
    });
  });

  describe('listEntities', () => {
    it('returns empty array when no entities', async () => {
      const result = await entityResolutionService.listEntities('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('listEntityConflicts', () => {
    it('returns empty array when no conflicts', async () => {
      (supabaseAdmin as any).from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      });

      const result = await entityResolutionService.listEntityConflicts('user-1');

      expect(result).toEqual([]);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { harmonizationService } from '../../src/harmonization/harmonization.service';

vi.mock('../../src/services/orchestratorService', () => ({
  orchestratorService: {
    getSummary: vi.fn().mockResolvedValue({
      timeline: { events: [] },
      identity: { identity: { motifs: [] } },
      continuity: { conflicts: [] },
      autopilot: {},
      tasks: [],
    }),
  },
}));

describe('HarmonizationService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('compute', () => {
    it('returns summary with highlights, clusters, and recommendedSurfaces', async () => {
      const summary = await harmonizationService.compute('user-1');
      expect(summary).toHaveProperty('highlights');
      expect(summary).toHaveProperty('clusters');
      expect(summary).toHaveProperty('identityHints');
      expect(summary).toHaveProperty('continuityFlags');
      expect(summary).toHaveProperty('recommendedSurfaces');
      expect(Array.isArray(summary.highlights)).toBe(true);
      expect(Array.isArray(summary.recommendedSurfaces)).toBe(true);
    });
  });
});

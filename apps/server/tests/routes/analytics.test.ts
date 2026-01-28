import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { analyticsRouter } from '../../src/routes/analytics';
import { requireAuth } from '../../src/middleware/auth';
import * as analyticsModules from '../../src/services/analytics';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/analytics', () => ({
  identityPulseModule: { runEnhanced: vi.fn() },
  relationshipAnalyticsModule: { run: vi.fn() },
  sagaEngineModule: { run: vi.fn() },
  characterAnalyticsModule: { run: vi.fn() },
  memoryFabricModule: { run: vi.fn() },
  insightEngineModule: { run: vi.fn() },
  predictionEngineModule: { run: vi.fn() },
  shadowEngineModule: { run: vi.fn() },
  xpEngineModule: { run: vi.fn() },
  lifeMapModule: { run: vi.fn() },
  searchEngineModule: { run: vi.fn() },
}));

vi.mock('../../src/services/analytics/orchestrator', () => ({
  buildAnalyticsContext: vi.fn().mockResolvedValue({
    userId: 'user-123',
    dataVersion: 'test',
    modelVersion: 'v1',
    timeWindow: { start: 0, end: Date.now() },
    seed: 0,
    timeRange: '30',
  }),
  runLegacyAnalytics: vi.fn().mockImplementation(async (name: string, ctx: { userId: string; timeRange?: string }, run: (c: typeof ctx) => Promise<unknown>) => {
    const value = await run(ctx);
    return { value, confidence: null, sampleSize: null, diagnostics: { analyticsType: name, executionTimeMs: 0, warnings: [], invariantsPassed: true } };
  }),
}));

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRouter);

describe('Analytics API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
    vi.mocked(analyticsModules.identityPulseModule.runEnhanced).mockResolvedValue({});
  });

  describe('GET /api/analytics/identity', () => {
    it('should return identity pulse analytics', async () => {
      const response = await request(app).get('/api/analytics/identity').expect(200);
      expect(analyticsModules.identityPulseModule.runEnhanced).toHaveBeenCalledWith('user-123', '30');
    });
  });
});

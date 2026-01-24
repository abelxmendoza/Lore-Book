import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/beliefRealityReconciliationService', () => ({
  beliefRealityReconciliationService: {
    getResolutionsForUser: vi.fn().mockResolvedValue([]),
    getResolutionForBelief: vi.fn().mockResolvedValue(null),
    evaluateBelief: vi.fn().mockResolvedValue({}),
    abandonBelief: vi.fn().mockResolvedValue({}),
    reevaluateAllBeliefs: vi.fn().mockResolvedValue(undefined),
  },
}));

import beliefRealityReconciliationRouter from '../../src/routes/beliefRealityReconciliation';
import { beliefRealityReconciliationService } from '../../src/services/beliefRealityReconciliationService';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/belief-reconciliation', beliefRealityReconciliationRouter);

describe('BeliefRealityReconciliation API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /resolutions returns resolutions', async () => {
    vi.mocked(beliefRealityReconciliationService.getResolutionsForUser).mockResolvedValue([]);
    const res = await request(app).get('/api/belief-reconciliation/resolutions').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('resolutions');
  });

  it('GET /resolution/:beliefUnitId returns 404 when not found', async () => {
    vi.mocked(beliefRealityReconciliationService.getResolutionForBelief).mockResolvedValue(null);
    await request(app).get('/api/belief-reconciliation/resolution/belief-1').expect(404);
  });

  it('POST /abandon/:beliefUnitId returns success', async () => {
    vi.mocked(beliefRealityReconciliationService.abandonBelief).mockResolvedValue({} as any);
    const res = await request(app)
      .post('/api/belief-reconciliation/abandon/belief-1')
      .send({ note: 'test' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /reevaluate-all returns accepted', async () => {
    const res = await request(app).post('/api/belief-reconciliation/reevaluate-all').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

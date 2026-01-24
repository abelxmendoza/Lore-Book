import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/perceptionReactionEngine', () => ({
  perceptionReactionEngine: {
    analyzePatterns: vi.fn().mockResolvedValue([]),
    calculateStabilityMetrics: vi.fn().mockResolvedValue({}),
    getReactionsNeedingReflection: vi.fn().mockResolvedValue([]),
    recordReflection: vi.fn().mockResolvedValue(undefined),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import perceptionReactionEngineRouter from '../../src/routes/perceptionReactionEngine';

const app = express();
app.use(express.json());
app.use('/api/perception-reaction-engine', perceptionReactionEngineRouter);

describe('PerceptionReactionEngine API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /patterns returns insights', async () => {
    const res = await request(app).get('/api/perception-reaction-engine/patterns').expect(200);
    expect(res.body).toHaveProperty('insights');
  });

  it('GET /stability returns metrics', async () => {
    const res = await request(app).get('/api/perception-reaction-engine/stability').expect(200);
    expect(res.body).toHaveProperty('metrics');
  });

  it('POST /reflection/:reactionId returns success', async () => {
    const res = await request(app)
      .post('/api/perception-reaction-engine/reflection/r1')
      .send({ response: 'ok' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /reflection/:reactionId returns 400 when response missing', async () => {
    await request(app).post('/api/perception-reaction-engine/reflection/r1').send({}).expect(400);
  });
});

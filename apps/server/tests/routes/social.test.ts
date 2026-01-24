import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/social/socialNetworkEngine', () => ({
  SocialNetworkEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      process: vi.fn().mockResolvedValue({
        nodes: [],
        edges: [],
        communities: [],
        influence: {},
        toxic: [],
        drift: [],
        score: {},
        insights: [],
      }),
    };
  }),
}));
vi.mock('../../src/services/social/socialStorage', () => ({
  SocialStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getStats: vi.fn().mockResolvedValue({}),
      saveNodes: vi.fn().mockResolvedValue(undefined),
      saveEdges: vi.fn().mockResolvedValue(undefined),
      saveCommunities: vi.fn().mockResolvedValue(undefined),
      saveInfluenceScores: vi.fn().mockResolvedValue(undefined),
      saveToxicitySignals: vi.fn().mockResolvedValue(undefined),
      saveDriftEvents: vi.fn().mockResolvedValue(undefined),
      saveNetworkScore: vi.fn().mockResolvedValue(undefined),
      saveInsights: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

import socialRouter from '../../src/routes/social';

const app = express();
app.use(express.json());
app.use('/api/social', socialRouter);

describe('Social API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/social/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('nodes');
  });

  it('GET /stats returns stats', async () => {
    const res = await request(app).get('/api/social/stats').expect(200);
    expect(res.body).toBeDefined();
  });
});

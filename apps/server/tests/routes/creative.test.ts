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
vi.mock('../../src/services/creative/creativeEngine', () => ({
  CreativeEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ events: [], flowStates: [], blocks: [], inspiration: [], projectStages: [], score: {}, insights: [] }) };
  }),
}));
vi.mock('../../src/services/creative/creativeStorage', () => ({
  CreativeStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getCreativeEvents: vi.fn().mockResolvedValue([]),
      saveCreativeEvents: vi.fn().mockResolvedValue([]),
      saveFlowStates: vi.fn().mockResolvedValue([]),
      saveCreativeBlocks: vi.fn().mockResolvedValue([]),
      saveInspirationSources: vi.fn().mockResolvedValue([]),
      saveProjectLifecycles: vi.fn().mockResolvedValue([]),
      saveCreativeScore: vi.fn().mockResolvedValue(null),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import creativeRouter from '../../src/routes/creative';

const app = express();
app.use(express.json());
app.use('/api/creative', creativeRouter);

describe('Creative API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/creative/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('events');
  });

  it('GET /events returns events', async () => {
    const res = await request(app).get('/api/creative/events').expect(200);
    expect(res.body).toHaveProperty('events');
  });
});

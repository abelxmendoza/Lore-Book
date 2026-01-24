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
vi.mock('../../src/services/growth/growthEngine', () => ({
  GrowthEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ signals: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/growth/growthStorage', () => ({
  GrowthStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getSignals: vi.fn().mockResolvedValue([]),
      getInsights: vi.fn().mockResolvedValue([]),
      saveSignals: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import growthRouter from '../../src/routes/growth';

const app = express();
app.use(express.json());
app.use('/api/growth', growthRouter);

describe('Growth API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/growth/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('signals');
  });

  it('GET /signals returns signals', async () => {
    const res = await request(app).get('/api/growth/signals').expect(200);
    expect(res.body).toHaveProperty('signals');
  });
});

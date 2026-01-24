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
vi.mock('../../src/services/values/valuesEngine', () => ({
  ValuesEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ valueSignals: [], beliefSignals: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/values/valuesStorage', () => ({
  ValuesStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getValueSignals: vi.fn().mockResolvedValue([]),
      saveValueSignals: vi.fn().mockResolvedValue([]),
      saveBeliefSignals: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import valuesRouter from '../../src/routes/values';

const app = express();
app.use(express.json());
app.use('/api/values', valuesRouter);

describe('Values API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/values/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('valueSignals');
  });

  it('GET /signals returns signals', async () => {
    const res = await request(app).get('/api/values/signals').expect(200);
    expect(res.body).toHaveProperty('signals');
  });
});

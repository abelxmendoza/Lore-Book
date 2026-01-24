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
vi.mock('../../src/services/legacy/legacyEngine', () => ({
  LegacyEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ signals: [], clusters: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/legacy/legacyStorage', () => ({
  LegacyStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getSignals: vi.fn().mockResolvedValue([]),
      saveSignals: vi.fn().mockResolvedValue([]),
      saveClusters: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import legacyRouter from '../../src/routes/legacy';

const app = express();
app.use(express.json());
app.use('/api/legacy', legacyRouter);

describe('Legacy API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/legacy/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('signals');
  });

  it('GET /signals returns signals', async () => {
    const res = await request(app).get('/api/legacy/signals').expect(200);
    expect(res.body).toHaveProperty('signals');
  });
});

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
vi.mock('../../src/services/resilience/resilienceEngine', () => ({
  ResilienceEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      process: vi.fn().mockResolvedValue({ setbacks: [], insights: [] }),
      processEnhanced: vi.fn().mockResolvedValue({ setbacks: [], insights: [] }),
    };
  }),
}));
vi.mock('../../src/services/resilience/resilienceStorage', () => ({
  ResilienceStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getSetbacks: vi.fn().mockResolvedValue([]),
      getRecoveryEvents: vi.fn().mockResolvedValue([]),
      getInsights: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
      saveSetbacks: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import resilienceRouter from '../../src/routes/resilience';

const app = express();
app.use(express.json());
app.use('/api/resilience', resilienceRouter);

describe('Resilience API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /process returns result', async () => {
    const res = await request(app).post('/api/resilience/process').send({}).expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /setbacks returns setbacks', async () => {
    const res = await request(app).get('/api/resilience/setbacks').expect(200);
    expect(res.body).toHaveProperty('setbacks');
  });
});

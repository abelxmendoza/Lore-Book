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
vi.mock('../../src/services/intervention/interventionEngine', () => ({
  InterventionEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      process: vi.fn().mockResolvedValue([]),
      getActiveInterventions: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue({ id: 'i1' }),
    };
  }),
}));

import interventionRouter from '../../src/routes/intervention';

const app = express();
app.use(express.json());
app.use('/api/intervention', interventionRouter);

describe('Intervention API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /process returns interventions', async () => {
    const res = await request(app).post('/api/intervention/process').send({}).expect(200);
    expect(res.body).toHaveProperty('interventions');
  });

  it('GET /active returns interventions', async () => {
    const res = await request(app).get('/api/intervention/active').expect(200);
    expect(res.body).toHaveProperty('interventions');
  });
});

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
vi.mock('../../src/services/dreams/dreamsEngine', () => ({
  DreamsEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ dreamSignals: [], aspirationSignals: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/dreams/dreamsStorage', () => ({
  DreamsStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getDreamSignals: vi.fn().mockResolvedValue([]),
      saveDreamSignals: vi.fn().mockResolvedValue([]),
      saveAspirationSignals: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import dreamsRouter from '../../src/routes/dreams';

const app = express();
app.use(express.json());
app.use('/api/dreams', dreamsRouter);

describe('Dreams API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/dreams/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('dreamSignals');
  });

  it('GET /signals returns signals', async () => {
    const res = await request(app).get('/api/dreams/signals').expect(200);
    expect(res.body).toHaveProperty('signals');
  });
});

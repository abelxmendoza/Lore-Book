import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/thoughtOrchestration/thoughtOrchestrationService', () => ({
  thoughtOrchestrationService: {
    processThought: vi.fn().mockResolvedValue({}),
    quickClassify: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/services/insecurityGraph/insecurityGraphService', () => ({
  insecurityGraphService: { getUserPatterns: vi.fn().mockResolvedValue([]) },
}));

import thoughtsRouter from '../../src/routes/thoughts';

const app = express();
app.use(express.json());
app.use('/api/thoughts', thoughtsRouter);

describe('Thoughts API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /process returns result', async () => {
    const res = await request(app)
      .post('/api/thoughts/process')
      .send({ thoughtText: 'Hello' })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /process returns 400 without thoughtText', async () => {
    await request(app).post('/api/thoughts/process').send({}).expect(400);
  });

  it('GET /insecurities returns patterns', async () => {
    const res = await request(app).get('/api/thoughts/insecurities').expect(200);
    expect(res.body).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/consolidation/consolidationEngine', () => ({
  MemoryConsolidationEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      findCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
      consolidate: vi.fn().mockResolvedValue({ success: true }),
      getStats: vi.fn().mockResolvedValue({}),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import consolidationRouter from '../../src/routes/consolidation';

const app = express();
app.use(express.json());
app.use('/api/consolidation', consolidationRouter);

describe('Consolidation API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /candidates should return payload', async () => {
    const res = await request(app).get('/api/consolidation/candidates').expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /consolidate should return 400 for invalid candidate', async () => {
    await request(app).post('/api/consolidation/consolidate').send({}).expect(400);
  });

  it('GET /stats should return stats', async () => {
    const res = await request(app).get('/api/consolidation/stats').expect(200);
    expect(res.body).toBeDefined();
  });
});

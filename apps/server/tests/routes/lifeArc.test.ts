import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/lifeArcService', () => ({
  lifeArcService: {
    getRecentLifeArc: vi.fn().mockResolvedValue({ moments: [], summary: {} }),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import lifeArcRouter from '../../src/routes/lifeArc';

const app = express();
app.use(express.json());
app.use('/api/life-arc', lifeArcRouter);

describe('LifeArc API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /recent returns result', async () => {
    const res = await request(app).get('/api/life-arc/recent').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

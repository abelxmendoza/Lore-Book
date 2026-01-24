import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/learning/learningEngine', () => ({
  LearningEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getLearning: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
      extractFromEntry: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import learningRouter from '../../src/routes/learning';

const app = express();
app.use(express.json());
app.use('/api/learning', learningRouter);

describe('Learning API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return payload', async () => {
    const res = await request(app).get('/api/learning').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /stats should return stats', async () => {
    const res = await request(app).get('/api/learning/stats').expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /extract should return learning', async () => {
    const res = await request(app)
      .post('/api/learning/extract')
      .send({ entryId: 'e1', content: 'text', entryDate: '2024-01-01' })
      .expect(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /extract should return 400 when fields missing', async () => {
    await request(app).post('/api/learning/extract').send({}).expect(400);
  });
});

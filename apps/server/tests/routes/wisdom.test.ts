import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/wisdom/wisdomEngine', () => ({
  WisdomEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getWisdom: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
      extractFromEntry: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import wisdomRouter from '../../src/routes/wisdom';

const app = express();
app.use(express.json());
app.use('/api/wisdom', wisdomRouter);

describe('Wisdom API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return payload', async () => {
    const res = await request(app).get('/api/wisdom').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /stats should return stats', async () => {
    const res = await request(app).get('/api/wisdom/stats').expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /extract should return wisdom', async () => {
    const res = await request(app)
      .post('/api/wisdom/extract')
      .send({ entryId: 'e1', content: 'text', entryDate: '2024-01-01' })
      .expect(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /extract should return 400 when fields missing', async () => {
    await request(app).post('/api/wisdom/extract').send({}).expect(400);
  });
});

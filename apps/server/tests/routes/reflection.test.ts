import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/reflection/reflectionEngine', () => ({
  ReflectionEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ reflections: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/reflection/reflectionStorage', () => ({
  ReflectionStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getReflections: vi.fn().mockResolvedValue([]),
      saveReflections: vi.fn().mockResolvedValue(undefined),
      saveInsights: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import reflectionRouter from '../../src/routes/reflection';

const app = express();
app.use(express.json());
app.use('/api/reflection', reflectionRouter);

describe('Reflection API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze should return result', async () => {
    const res = await request(app).post('/api/reflection/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('reflections');
  });

  it('GET /reflections should return reflections', async () => {
    const res = await request(app).get('/api/reflection/reflections').expect(200);
    expect(res.body).toHaveProperty('reflections');
  });
});

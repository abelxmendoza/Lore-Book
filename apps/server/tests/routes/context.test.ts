import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/context/contextEngine', () => ({
  ContextEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { getContext: vi.fn().mockResolvedValue({ temporal: {}, emotional: {} }) };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import contextRouter from '../../src/routes/context';

const app = express();
app.use(express.json());
app.use('/api/context', contextRouter);

describe('Context API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return context', async () => {
    const res = await request(app).get('/api/context').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /temporal should return temporal', async () => {
    const res = await request(app).get('/api/context/temporal').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /emotional should return emotional', async () => {
    const res = await request(app).get('/api/context/emotional').expect(200);
    expect(res.body).toBeDefined();
  });
});

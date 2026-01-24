import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/shadowEngine', () => ({
  ShadowEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('../../src/services/shadowEngine/shadowStorage', () => ({
  getShadowProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: { searchEntries: vi.fn().mockResolvedValue([]) },
}));

import { requireAuth } from '../../src/middleware/auth';
import shadowEngineRouter from '../../src/routes/shadowEngine';
import { getShadowProfile } from '../../src/services/shadowEngine/shadowStorage';

const app = express();
app.use(express.json());
app.use('/api/shadow', shadowEngineRouter);

describe('ShadowEngine API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze returns profile', async () => {
    const res = await request(app).post('/api/shadow/analyze').send({}).expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /profile returns 404 when not found', async () => {
    vi.mocked(getShadowProfile).mockResolvedValue(null);
    await request(app).get('/api/shadow/profile').expect(404);
  });
});

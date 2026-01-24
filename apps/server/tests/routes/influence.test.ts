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
vi.mock('../../src/services/influence/influenceEngine', () => ({
  InfluenceEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ profiles: [], events: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/influence/influenceStorage', () => ({
  InfluenceStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getProfiles: vi.fn().mockResolvedValue([]),
      saveProfiles: vi.fn().mockResolvedValue([]),
      saveEvents: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import influenceRouter from '../../src/routes/influence';

const app = express();
app.use(express.json());
app.use('/api/influence', influenceRouter);

describe('Influence API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /process returns result', async () => {
    const res = await request(app).post('/api/influence/process').send({}).expect(200);
    expect(res.body).toHaveProperty('profiles');
  });

  it('GET /profiles returns profiles', async () => {
    const res = await request(app).get('/api/influence/profiles').expect(200);
    expect(res.body).toHaveProperty('profiles');
  });
});

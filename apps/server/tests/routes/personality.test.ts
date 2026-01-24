import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/personality/personalityEngine', () => ({
  PersonalityEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ profile: { traits: [] }, insights: [] }) };
  }),
}));
vi.mock('../../src/services/personality/personalityStorage', () => ({
  PersonalityStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      saveTraits: vi.fn().mockResolvedValue(undefined),
      saveInsights: vi.fn().mockResolvedValue(undefined),
      getTraits: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import personalityRouter from '../../src/routes/personality';

const app = express();
app.use(express.json());
app.use('/api/personality', personalityRouter);

describe('Personality API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/personality/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('profile');
  });

  it('GET /profile returns profile', async () => {
    const res = await request(app).get('/api/personality/profile').expect(200);
    expect(res.body).toHaveProperty('profile');
  });
});

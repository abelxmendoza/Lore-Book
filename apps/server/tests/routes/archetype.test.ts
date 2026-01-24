import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/archetype/archetypeEngine', () => ({
  ArchetypeEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ signals: [], profile: {}, transitions: [], distortions: [] }) };
  }),
}));
vi.mock('../../src/services/archetype/archetypeStorage', () => ({
  ArchetypeStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getProfile: vi.fn().mockResolvedValue({}),
      saveSignals: vi.fn().mockResolvedValue(undefined),
      saveProfile: vi.fn().mockResolvedValue(undefined),
      saveTransitions: vi.fn().mockResolvedValue(undefined),
      saveDistortions: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import archetypeRouter from '../../src/routes/archetype';

const app = express();
app.use(express.json());
app.use('/api/archetype', archetypeRouter);

describe('Archetype API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze should return result', async () => {
    const res = await request(app).post('/api/archetype/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('signals');
  });

  it('GET /profile should return profile', async () => {
    const res = await request(app).get('/api/archetype/profile').expect(200);
    expect(res.body).toHaveProperty('profile');
  });
});

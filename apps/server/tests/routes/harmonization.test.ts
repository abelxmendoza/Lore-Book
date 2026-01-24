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
vi.mock('../../src/harmonization/harmonization.service', () => ({
  harmonizationService: {
    compute: vi.fn().mockResolvedValue({
      highlights: [],
      clusters: {},
      identityHints: [],
      continuityFlags: [],
      recommendedSurfaces: ['timeline'],
    }),
  },
}));

import { harmonizationRouter } from '../../src/harmonization/harmonization.router';

const app = express();
app.use(express.json());
app.use('/api/harmonization', harmonizationRouter);

describe('Harmonization API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /summary returns harmonization summary', async () => {
    const res = await request(app).get('/api/harmonization/summary').expect(200);
    expect(res.body).toHaveProperty('highlights');
    expect(res.body).toHaveProperty('clusters');
    expect(res.body).toHaveProperty('recommendedSurfaces');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/entityResolutionService', () => ({
  entityResolutionService: {
    listEntities: vi.fn().mockResolvedValue([]),
    editEntity: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '../../src/middleware/auth';
import entityAmbiguityRouter from '../../src/routes/entityAmbiguity';

const app = express();
app.use(express.json());
app.use('/api/entity-ambiguity', entityAmbiguityRouter);

describe('EntityAmbiguity API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /resolve with create_new returns success', async () => {
    const res = await request(app)
      .post('/api/entity-ambiguity/resolve')
      .send({ surface_text: 'Bob', create_new: true })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /resolve without surface_text returns 400', async () => {
    await request(app).post('/api/entity-ambiguity/resolve').send({}).expect(400);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockImplementation((_req, res) => {
      res.status(401).json({ error: 'Unauthorized' });
    });
    await request(app)
      .post('/api/entity-ambiguity/resolve')
      .send({ surface_text: 'Bob', create_new: true })
      .expect(401);
  });
});

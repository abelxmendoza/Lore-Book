import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/socialProjection', () => ({
  SocialProjectionEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('../../src/services/socialProjection/projectionStorage', () => ({
  ProjectionStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getProjections: vi.fn().mockResolvedValue([]),
      getLinks: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import socialProjectionRouter from '../../src/routes/socialProjection';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/social-projection', socialProjectionRouter);

describe('SocialProjection API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result with entries and user', async () => {
    const res = await request(app)
      .post('/api/social-projection/analyze')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET / returns projections and links', async () => {
    const res = await request(app).get('/api/social-projection').expect(200);
    expect(res.body).toHaveProperty('projections');
    expect(res.body).toHaveProperty('links');
  });
});

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
vi.mock('../../src/services/narrative/narrativeEngine', () => ({
  NarrativeEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      buildNarrative: vi.fn().mockResolvedValue({ id: 'n1', content: 'Narrative' }),
      getNarrative: vi.fn().mockResolvedValue({ id: 'n1' }),
    };
  }),
}));

import narrativeRouter from '../../src/routes/narrative';

const app = express();
app.use(express.json());
app.use('/api/narrative', narrativeRouter);

describe('Narrative API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /build returns narrative', async () => {
    const res = await request(app)
      .post('/api/narrative/build')
      .send({ entryIds: ['e1'] })
      .expect(200);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /build returns 400 without entryIds', async () => {
    await request(app).post('/api/narrative/build').send({}).expect(400);
  });

  it('GET /:id returns narrative', async () => {
    const res = await request(app).get('/api/narrative/n1').expect(200);
    expect(res.body).toHaveProperty('id');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/innerMythology', () => ({
  InnerMythologyEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ myths: [] }) };
  }),
}));
vi.mock('../../src/services/innerMythology/mythStorage', () => ({
  MythStorage: vi.fn().mockImplementation(function (this: unknown) {
    return { getMyths: vi.fn().mockResolvedValue([]) };
  }),
}));

import innerMythologyRouter from '../../src/routes/innerMythology';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/inner-mythology', innerMythologyRouter);

describe('InnerMythology API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result with entries and user', async () => {
    const res = await request(app)
      .post('/api/inner-mythology/analyze')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /myths returns myths', async () => {
    const res = await request(app).get('/api/inner-mythology/myths').expect(200);
    expect(res.body).toHaveProperty('myths');
  });
});

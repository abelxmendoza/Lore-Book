import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/narrativeDiffEngineService', () => ({
  narrativeDiffEngineService: {
    generateDiffsFromIR: vi.fn().mockResolvedValue([]),
    getDiffsForUser: vi.fn().mockResolvedValue([]),
    getDiffsForEntity: vi.fn().mockResolvedValue([]),
  },
}));

import narrativeDiffRouter from '../../src/routes/narrativeDiff';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/narrative-diff', narrativeDiffRouter);

describe('NarrativeDiff API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /generate returns diffs', async () => {
    const res = await request(app)
      .post('/api/narrative-diff/generate')
      .send({ contract: 'ARCHIVIST' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('diffs');
  });

  it('GET /diffs returns diffs', async () => {
    const res = await request(app).get('/api/narrative-diff/diffs').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

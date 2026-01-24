import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/external/external_hub.service', () => ({
  externalHubService: {
    ingest: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn().mockReturnValue({ sources: [], timeline: [] }),
  },
}));

import { externalHubRouter } from '../../src/external/external_hub.router';

const app = express();
app.use(express.json());
app.use('/api/external-hub', externalHubRouter);

describe('External Hub API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /:source/ingest returns entries', async () => {
    const res = await request(app).post('/api/external-hub/github/ingest').send({}).expect(201);
    expect(res.body).toHaveProperty('entries');
  });

  it('POST /:source/ingest returns 400 for invalid source', async () => {
    await request(app).post('/api/external-hub/invalid/ingest').send({}).expect(400);
  });

  it('GET /status returns status', async () => {
    const res = await request(app).get('/api/external-hub/status').expect(200);
    expect(res.body).toHaveProperty('sources');
    expect(res.body).toHaveProperty('timeline');
  });
});

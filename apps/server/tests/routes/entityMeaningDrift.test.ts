import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/entityMeaningDriftService', () => ({
  entityMeaningDriftService: {
    getMeaningTimeline: vi.fn().mockResolvedValue([]),
    confirmTransition: vi.fn().mockResolvedValue(undefined),
  },
}));

import entityMeaningDriftRouter from '../../src/routes/entityMeaningDrift';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/entity-meaning-drift', entityMeaningDriftRouter);

describe('EntityMeaningDrift API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /timeline/:entityId returns timeline', async () => {
    const res = await request(app).get('/api/entity-meaning-drift/timeline/e1').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('timeline');
  });

  it('POST /confirm returns success', async () => {
    const res = await request(app)
      .post('/api/entity-meaning-drift/confirm')
      .send({ transition_id: 't1' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /confirm without transition_id returns 400', async () => {
    await request(app).post('/api/entity-meaning-drift/confirm').send({}).expect(400);
  });
});

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
vi.mock('../../src/services/prediction/predictionEngine', () => ({
  PredictionEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      generateForecast: vi.fn().mockResolvedValue({ predictions: [] }),
      getActivePredictions: vi.fn().mockResolvedValue([]),
      getPredictionsByDateRange: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import predictionRouter from '../../src/routes/prediction';

const app = express();
app.use(express.json());
app.use('/api/prediction', predictionRouter);

describe('Prediction API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /forecast returns forecast', async () => {
    const res = await request(app).post('/api/prediction/forecast').send({}).expect(200);
    expect(res.body).toHaveProperty('predictions');
  });

  it('GET /active returns predictions', async () => {
    const res = await request(app).get('/api/prediction/active').expect(200);
    expect(res.body).toHaveProperty('predictions');
  });

  it('GET /range returns 400 without dates', async () => {
    await request(app).get('/api/prediction/range').expect(400);
  });
});

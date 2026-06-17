import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/health/healthEngine', () => ({
  HealthEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ symptoms: [], sleep: [], energy: [], score: {}, insights: [] }) };
  }),
}));
vi.mock('../../src/services/health/healthStorage', () => ({
  HealthStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getSymptomEvents: vi.fn().mockResolvedValue([]),
      getSleepEvents: vi.fn().mockResolvedValue([]),
      getEnergyEvents: vi.fn().mockResolvedValue([]),
      getLatestWellnessScore: vi.fn().mockResolvedValue(null),
      getInsights: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
      saveSymptomEvents: vi.fn().mockResolvedValue([]),
      saveSleepEvents: vi.fn().mockResolvedValue([]),
      saveEnergyEvents: vi.fn().mockResolvedValue([]),
      saveWellnessScore: vi.fn().mockResolvedValue(null),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import wellnessRouter from '../../src/routes/wellness';

const app = express();
app.use(express.json());
app.use('/api/wellness', wellnessRouter);

describe('Wellness API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze should return result', async () => {
    const res = await request(app).post('/api/wellness/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('symptoms');
  });

  it('GET /symptoms should return symptoms', async () => {
    const res = await request(app).get('/api/wellness/symptoms').expect(200);
    expect(res.body).toHaveProperty('symptoms');
  });

  it('GET /sleep should return sleep', async () => {
    const res = await request(app).get('/api/wellness/sleep').expect(200);
    expect(res.body).toHaveProperty('sleep');
  });

  it('GET /stats should return stats', async () => {
    const res = await request(app).get('/api/wellness/stats').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /energy should return energy', async () => {
    const res = await request(app).get('/api/wellness/energy').expect(200);
    expect(res.body).toHaveProperty('energy');
  });

  it('GET /score should return wellness score', async () => {
    const res = await request(app).get('/api/wellness/score').expect(200);
    expect(res.body).toHaveProperty('wellness');
  });

  it('GET /insights should return insights', async () => {
    const res = await request(app).get('/api/wellness/insights').expect(200);
    expect(res.body).toHaveProperty('insights');
  });
});

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
import healthRouter from '../../src/routes/health';

const app = express();
app.use(express.json());
app.use('/api/health', healthRouter);

describe('Health API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze should return result', async () => {
    const res = await request(app).post('/api/health/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('symptoms');
  });

  it('GET /symptoms should return symptoms', async () => {
    const res = await request(app).get('/api/health/symptoms').expect(200);
    expect(res.body).toHaveProperty('symptoms');
  });

  it('GET /sleep should return sleep', async () => {
    const res = await request(app).get('/api/health/sleep').expect(200);
    expect(res.body).toHaveProperty('sleep');
  });

  it('GET /stats should return stats', async () => {
    const res = await request(app).get('/api/health/stats').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /energy should return energy', async () => {
    const res = await request(app).get('/api/health/energy').expect(200);
    expect(res.body).toHaveProperty('energy');
  });

  it('GET /wellness should return wellness', async () => {
    const res = await request(app).get('/api/health/wellness').expect(200);
    expect(res.body).toHaveProperty('wellness');
  });

  it('GET /insights should return insights', async () => {
    const res = await request(app).get('/api/health/insights').expect(200);
    expect(res.body).toHaveProperty('insights');
  });

  it('GET /insights accepts type query', async () => {
    const res = await request(app).get('/api/health/insights?type=sleep').expect(200);
    expect(res.body).toHaveProperty('insights');
  });

  it('GET /symptoms accepts type query', async () => {
    const res = await request(app).get('/api/health/symptoms?type=headache').expect(200);
    expect(res.body).toHaveProperty('symptoms');
  });
});

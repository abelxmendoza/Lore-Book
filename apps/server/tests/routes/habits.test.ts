import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/habits/habitEngine', () => ({
  HabitEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ habits: [], insights: [] }) };
  }),
}));
vi.mock('../../src/services/habits/habitStorage', () => ({
  HabitStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getHabits: vi.fn().mockResolvedValue([]),
      getInsights: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
      saveHabits: vi.fn().mockResolvedValue([]),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import habitsRouter from '../../src/routes/habits';

const app = express();
app.use(express.json());
app.use('/api/habits', habitsRouter);

describe('Habits API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return habits', async () => {
    const res = await request(app).get('/api/habits').expect(200);
    expect(res.body).toHaveProperty('habits');
  });

  it('POST /process should return result', async () => {
    const res = await request(app).post('/api/habits/process').send({}).expect(200);
    expect(res.body).toHaveProperty('habits');
  });

  it('GET /insights should return insights', async () => {
    const res = await request(app).get('/api/habits/insights').expect(200);
    expect(res.body).toHaveProperty('insights');
  });

  it('GET /stats should return stats', async () => {
    const res = await request(app).get('/api/habits/stats').expect(200);
    expect(res.body).toBeDefined();
  });
});

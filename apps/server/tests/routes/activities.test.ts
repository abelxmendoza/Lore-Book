import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/activities/activityResolver', () => ({
  ActivityResolver: vi.fn().mockImplementation(function (this: unknown) { return { process: vi.fn().mockResolvedValue([]) }; }),
}));
vi.mock('../../src/services/activities/storageService', () => ({
  ActivityStorage: vi.fn().mockImplementation(function (this: unknown) { return { loadAll: vi.fn().mockResolvedValue([]) }; }),
}));

import { requireAuth } from '../../src/middleware/auth';
import activitiesRouter from '../../src/routes/activities';

const app = express();
app.use(express.json());
app.use('/api/activities', activitiesRouter);

describe('Activities API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return activities', async () => {
    const res = await request(app).get('/api/activities').expect(200);
    expect(res.body).toHaveProperty('activities');
  });

  it('POST /resolve should return resolved activities', async () => {
    const res = await request(app).post('/api/activities/resolve').send({}).expect(200);
    expect(res.body).toHaveProperty('activities');
  });

  it('GET /:id should return 404 when not found', async () => {
    await request(app).get('/api/activities/nonexistent').expect(404);
  });
});

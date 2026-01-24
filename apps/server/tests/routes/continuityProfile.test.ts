import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/continuity/continuityService', () => ({
  continuityService: {
    getContinuityProfile: vi.fn().mockResolvedValue(null),
    getContinuityProfileHistory: vi.fn().mockResolvedValue([]),
    computeContinuityProfile: vi.fn().mockResolvedValue({}),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import continuityProfileRouter from '../../src/routes/continuityProfile';
import { continuityService } from '../../src/services/continuity/continuityService';

const app = express();
app.use(express.json());
app.use('/api/continuity-profile', continuityProfileRouter);

describe('ContinuityProfile API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /profile returns 404 when no profile', async () => {
    vi.mocked(continuityService.getContinuityProfile).mockResolvedValue(null);
    await request(app).get('/api/continuity-profile/profile').expect(404);
  });

  it('GET /profile/history returns profiles', async () => {
    vi.mocked(continuityService.getContinuityProfileHistory).mockResolvedValue([]);
    const res = await request(app).get('/api/continuity-profile/profile/history').expect(200);
    expect(res.body).toHaveProperty('profiles');
  });

  it('POST /profile/compute returns profile', async () => {
    vi.mocked(continuityService.computeContinuityProfile).mockResolvedValue({} as any);
    const res = await request(app).post('/api/continuity-profile/profile/compute').send({}).expect(200);
    expect(res.body).toHaveProperty('profile');
  });
});

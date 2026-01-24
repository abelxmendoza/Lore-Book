import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/rpg/companionEngine', () => ({ companionEngine: { getCompanionStats: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/services/rpg/locationEngine', () => ({ locationEngine: { getLocationStats: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/services/rpg/insights/companionInsights', () => ({ companionInsightGenerator: { generateAllInsights: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/services/rpg/insights/locationInsights', () => ({ locationInsightGenerator: { generateAllInsights: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [] }),
    }),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import rpgRouter from '../../src/routes/rpg';

const app = express();
app.use(express.json());
app.use('/api/rpg', rpgRouter);

describe('RPG API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /companions should return companions', async () => {
    const res = await request(app).get('/api/rpg/companions').expect(200);
    expect(res.body).toHaveProperty('companions');
  });

  it('GET /locations should return places', async () => {
    const res = await request(app).get('/api/rpg/locations').expect(200);
    expect(res.body).toHaveProperty('places');
  });
});

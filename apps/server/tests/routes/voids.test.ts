import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/biographyGeneration/voidAwarenessService', () => ({
  voidAwarenessService: {
    detectVoids: vi.fn().mockReturnValue([]),
  },
}));
vi.mock('../../src/services/engagement/promptGenerator', () => ({
  engagementPromptGenerator: {
    generateEngagingVoidPrompts: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import { voidRouter } from '../../src/routes/voids';

const app = express();
app.use(express.json());
app.use('/api/voids', voidRouter);

describe('Voids API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /gaps returns voids', async () => {
    const res = await request(app).get('/api/voids/gaps').expect(200);
    expect(res.body).toHaveProperty('voids');
    expect(res.body).toHaveProperty('totalGaps');
  });

  it('GET /stats returns stats', async () => {
    const res = await request(app).get('/api/voids/stats').expect(200);
    expect(res.body).toHaveProperty('totalGaps');
  });
});

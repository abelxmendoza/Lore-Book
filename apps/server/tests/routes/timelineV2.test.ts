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
vi.mock('../../src/services/timelineV2', () => ({
  timelineService: {
    listTimelines: vi.fn().mockResolvedValue([]),
    createTimeline: vi.fn().mockResolvedValue({ id: 't1', title: 'Timeline' }),
    getTimelineHierarchy: vi.fn().mockResolvedValue({ id: 't1' }),
    updateTimeline: vi.fn().mockResolvedValue({ id: 't1' }),
    deleteTimeline: vi.fn().mockResolvedValue(undefined),
  },
  timelineMembershipService: { getMemberships: vi.fn().mockResolvedValue([]) },
  timelineSearchService: { search: vi.fn().mockResolvedValue([]) },
  timelineRelationshipService: { getRelationships: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

import timelineV2Router from '../../src/routes/timelineV2';

const app = express();
app.use(express.json());
app.use('/api/timeline-v2', timelineV2Router);

describe('Timeline V2 API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET / returns timelines', async () => {
    const res = await request(app).get('/api/timeline-v2').expect(200);
    expect(res.body).toHaveProperty('timelines');
  });

  it('POST / creates timeline', async () => {
    const res = await request(app)
      .post('/api/timeline-v2')
      .send({
        title: 'Era',
        timeline_type: 'life_era',
        start_date: '2020-01-01',
      })
      .expect(201);
    expect(res.body).toHaveProperty('timeline');
  });

  it('POST / returns 400 when title missing', async () => {
    await request(app)
      .post('/api/timeline-v2')
      .send({ timeline_type: 'life_era', start_date: '2020-01-01' })
      .expect(400);
  });
});

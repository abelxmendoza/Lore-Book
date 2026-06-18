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

vi.mock('../../src/services/continuityRuntime/arcs/arcService', () => ({
  arcService: {
    listForUser: vi.fn().mockResolvedValue([
      {
        id: 'arc-1',
        user_id: 'u1',
        title: 'College Years',
        arc_type: 'life_era',
        track: null,
        dominant_emotion: null,
        emotional_arc: null,
        parent_id: null,
        start_date: '2018-01-01',
        end_date: null,
        is_active: false,
        summary: null,
        confidence: 0.8,
        source: 'user_created',
        tags: [],
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]),
    upsert: vi.fn().mockResolvedValue({ id: 'arc-1', title: 'College Years', arc_type: 'life_era', user_id: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
    getById: vi.fn().mockResolvedValue({ id: 'arc-1', title: 'College Years', arc_type: 'life_era', user_id: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/routes/chronology', () => ({ default: express.Router() }));
vi.mock('../../src/routes/timelineHierarchy', () => ({ timelineHierarchyRouter: express.Router() }));

import { arcService } from '../../src/services/continuityRuntime/arcs/arcService';
import timelineV2Router from '../../src/routes/timelineV2';

const app = express();
app.use(express.json());
app.use('/api/timeline-v2', timelineV2Router);

describe('Timeline V2 API — integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET / returns timelines from life_arcs', async () => {
    const res = await request(app).get('/api/timeline-v2').expect(200);
    expect(res.body.timelines[0]).toMatchObject({ id: 'arc-1', timeline_type: 'life_era' });
    expect(arcService.listForUser).toHaveBeenCalledWith('u1');
  });

  it('POST / validates title', async () => {
    await request(app).post('/api/timeline-v2').send({ timeline_type: 'life_era' }).expect(400);
  });

  it('GET /:id returns 404 when missing', async () => {
    vi.mocked(arcService.getById).mockResolvedValueOnce(null);
    await request(app).get('/api/timeline-v2/missing').expect(404);
  });
});

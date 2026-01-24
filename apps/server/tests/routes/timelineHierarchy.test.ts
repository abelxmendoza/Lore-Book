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
vi.mock('../../src/middleware/validateRequest', () => ({
  validateRequest: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../src/services/timelineManager', () => ({
  timelineManager: {
    createNode: vi.fn().mockResolvedValue({ id: 'n1', title: 'Node' }),
    updateNode: vi.fn().mockResolvedValue({ id: 'n1' }),
    getNode: vi.fn().mockResolvedValue({ id: 'n1' }),
    getChildren: vi.fn().mockResolvedValue([]),
    getNodeWithChildren: vi.fn().mockResolvedValue({ id: 'n1', children: [] }),
    closeNode: vi.fn().mockResolvedValue(undefined),
    deleteNode: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    autoClassify: vi.fn().mockResolvedValue({ layer: 'chapter' }),
    getRecommendations: vi.fn().mockResolvedValue([]),
    autoAssignTags: vi.fn().mockResolvedValue([]),
    refreshTitle: vi.fn().mockResolvedValue('Title'),
    autoGenerateSummary: vi.fn().mockResolvedValue('Summary'),
  },
}));

import { timelineHierarchyRouter } from '../../src/routes/timelineHierarchy';

const app = express();
app.use(express.json());
app.use('/api/timeline-hierarchy', timelineHierarchyRouter);

describe('Timeline Hierarchy API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /:layer/create creates node', async () => {
    const res = await request(app)
      .post('/api/timeline-hierarchy/chapter/create')
      .send({ start_date: '2024-01-01' })
      .expect(201);
    expect(res.body).toHaveProperty('node');
  });

  it('POST /:layer/create returns 400 for invalid layer', async () => {
    await request(app)
      .post('/api/timeline-hierarchy/invalid/create')
      .send({ start_date: '2024-01-01' })
      .expect(400);
  });

  it('GET /:layer/:id returns node', async () => {
    const res = await request(app).get('/api/timeline-hierarchy/chapter/n1').expect(200);
    expect(res.body).toHaveProperty('node');
  });

  it('POST /search returns results', async () => {
    const res = await request(app).post('/api/timeline-hierarchy/search').send({}).expect(200);
    expect(res.body).toHaveProperty('results');
  });

  it('GET /recommendations returns recommendations', async () => {
    const res = await request(app).get('/api/timeline-hierarchy/recommendations').expect(200);
    expect(res.body).toHaveProperty('recommendations');
  });
});

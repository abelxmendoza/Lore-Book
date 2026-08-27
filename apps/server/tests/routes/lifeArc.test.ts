import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/continuityRuntime/arcs/arcService', () => ({
  arcService: {
    getActiveArcs: vi.fn().mockResolvedValue([]),
    listArcs: vi.fn().mockResolvedValue([]),
    listForUser: vi.fn().mockResolvedValue([]),
    upsertArc: vi.fn().mockResolvedValue({ id: 'arc-1' }),
    getArc: vi.fn().mockResolvedValue(null),
    patchArc: vi.fn().mockResolvedValue({ id: 'arc-1' }),
    deleteArc: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../src/services/continuityRuntime/arcs/arcMembershipService', () => ({
  arcMembershipService: {
    getMembershipsForArc: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/continuityRuntime/arcs/arcRelationshipService', () => ({
  arcRelationshipService: {
    getRelationshipsForArc: vi.fn().mockResolvedValue([]),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import lifeArcRouter from '../../src/routes/lifeArc';

const app = express();
app.use(express.json());
app.use('/api/life-arc', lifeArcRouter);

describe('LifeArc API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(async (req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / returns arcs list', async () => {
    const res = await request(app).get('/api/life-arc/').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('GET /?active_only=true excludes day occasions', async () => {
    const { arcService } = await import('../../src/services/continuityRuntime/arcs/arcService');
    vi.mocked(arcService.getActiveArcs).mockResolvedValue([
      { id: 'work-1', title: 'Career Transition Arc', arc_type: 'work' },
      { id: 'shop-1', title: 'A Costco Shopping Trip With Jamie', arc_type: 'occasion' },
    ] as any);

    const res = await request(app).get('/api/life-arc/?active_only=true').expect(200);
    expect(res.body.arcs.map((arc: { title: string }) => arc.title)).toEqual(['Career Transition Arc']);
  });

  it('GET /?is_active=true is an alias for active_only', async () => {
    const { arcService } = await import('../../src/services/continuityRuntime/arcs/arcService');
    vi.mocked(arcService.getActiveArcs).mockResolvedValue([
      { id: 'work-1', title: 'Career Transition Arc', arc_type: 'work' },
    ] as any);

    const res = await request(app).get('/api/life-arc/?is_active=true').expect(200);
    expect(arcService.getActiveArcs).toHaveBeenCalled();
    expect(res.body.arcs).toHaveLength(1);
  });
});

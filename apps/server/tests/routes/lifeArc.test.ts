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
vi.mock('../../src/services/continuityRuntime/arcs/lifeArcProposalService', () => ({
  lifeArcProposalService: {
    list: vi.fn().mockResolvedValue([]),
    build: vi.fn().mockResolvedValue({
      audit: { canonicalItems: 2, proposedArcs: 1 },
      proposals: [{ fingerprint: 'proposal-fingerprint' }],
    }),
    updateDraft: vi.fn(),
    createArc: vi.fn().mockResolvedValue({ proposal: { id: 'proposal-1', status: 'created' }, arc: { id: 'arc-created' } }),
    merge: vi.fn().mockResolvedValue({ id: 'proposal-1', status: 'merged' }),
    dismiss: vi.fn().mockResolvedValue({ id: 'proposal-1', status: 'dismissed' }),
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

  it('builds proposals in dry-run mode by default', async () => {
    const { lifeArcProposalService } = await import('../../src/services/continuityRuntime/arcs/lifeArcProposalService');
    const res = await request(app).post('/api/life-arc/proposals/build').send({}).expect(200);
    expect(lifeArcProposalService.build).toHaveBeenCalledWith('u1', false, { autoCreateReady: false });
    expect(res.body).toMatchObject({ success: true, dry_run: true });
  });

  it('lists only the signed-in user’s pending proposals', async () => {
    const { lifeArcProposalService } = await import('../../src/services/continuityRuntime/arcs/lifeArcProposalService');
    await request(app).get('/api/life-arc/proposals?status=pending').expect(200);
    expect(lifeArcProposalService.list).toHaveBeenCalledWith('u1', 'pending');
  });

  it('keeps create, merge, and dismiss as independent review actions', async () => {
    const { lifeArcProposalService } = await import('../../src/services/continuityRuntime/arcs/lifeArcProposalService');
    const targetArcId = '11111111-1111-4111-8111-111111111111';

    await request(app).post('/api/life-arc/proposals/proposal-1/create').send({}).expect(201);
    await request(app).post('/api/life-arc/proposals/proposal-1/merge').send({ arc_id: targetArcId }).expect(200);
    await request(app).post('/api/life-arc/proposals/proposal-1/dismiss').send({ reason: 'user_dismissed' }).expect(200);

    expect(lifeArcProposalService.createArc).toHaveBeenCalledWith('u1', 'proposal-1');
    expect(lifeArcProposalService.merge).toHaveBeenCalledWith('u1', 'proposal-1', targetArcId);
    expect(lifeArcProposalService.dismiss).toHaveBeenCalledWith('u1', 'proposal-1', 'user_dismissed');
  });
});

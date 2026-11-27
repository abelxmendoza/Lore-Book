import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthority = vi.fn();
const svc = {
  getHivemindOverview: vi.fn(async () => ({ checkpoints: [], memories: [], milestones: [] })),
  listCheckpoints: vi.fn(async () => []),
  upsertCheckpoint: vi.fn(async (_u: string, a: Record<string, unknown>) => ({ id: 'c1', ...a })),
  deleteCheckpoint: vi.fn(async () => true),
  listMemories: vi.fn(async () => []),
  upsertMemory: vi.fn(async (_u: string, a: Record<string, unknown>) => ({ id: 'm1', ...a })),
  deleteMemory: vi.fn(async () => false),
  listMilestones: vi.fn(async () => []),
  addMilestone: vi.fn(async (_u: string, a: Record<string, unknown>) => ({ id: 'ms1', ...a })),
};

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
  },
}));
vi.mock('../../src/config/runtimePolicy', () => ({ isDevelopmentRuntime: () => false }));
vi.mock('../../src/lib/accountAuthority', () => ({
  resolveAccountAuthority: (...args: unknown[]) => mockAuthority(...args),
}));
vi.mock('../../src/services/hivemind/hivemindService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/hivemind/hivemindService')>();
  return { ...actual, ...svc };
});
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));

let app: express.Express;

beforeAll(async () => {
  const { hivemindRouter } = await import('../../src/routes/hivemind');
  app = express();
  app.use(express.json());
  app.use('/api/hivemind', hivemindRouter);
});

describe('/api/hivemind', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthority.mockResolvedValue({ canUseHivemind: true });
  });

  it('403s for an account without Hivemind access', async () => {
    mockAuthority.mockResolvedValue({ canUseHivemind: false });
    await request(app).get('/api/hivemind').expect(403);
    expect(svc.getHivemindOverview).not.toHaveBeenCalled();
  });

  it('returns the overview for an enabled account', async () => {
    const res = await request(app).get('/api/hivemind').expect(200);
    expect(res.body).toEqual({ checkpoints: [], memories: [], milestones: [] });
    expect(svc.getHivemindOverview).toHaveBeenCalledWith('user-123');
  });

  it('validates and saves a checkpoint for the signed-in user', async () => {
    await request(app).put('/api/hivemind/checkpoints').send({ project: '' }).expect(400);
    const res = await request(app)
      .put('/api/hivemind/checkpoints')
      .send({ project: 'Lore-Book', agent: 'claude_code', where_left_off: 'Hivemind API done' })
      .expect(200);
    expect(res.body.checkpoint.project).toBe('Lore-Book');
    expect(svc.upsertCheckpoint).toHaveBeenCalledWith('user-123', expect.objectContaining({ agent: 'claude_code' }));
  });

  it('rejects a non-uuid id and 404s a missing memory', async () => {
    await request(app).delete('/api/hivemind/memories/not-a-uuid').expect(400);
    await request(app).delete('/api/hivemind/memories/6f1c1c56-2a8e-4b8c-9a3e-1f2b3c4d5e6f').expect(404);
  });

  it('creates a milestone', async () => {
    await request(app)
      .post('/api/hivemind/milestones')
      .send({ track: 'Full-stack', project: 'Lore-Book', highlight: 'Shipped Hivemind' })
      .expect(201);
  });
});

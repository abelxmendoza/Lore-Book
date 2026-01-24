import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/entityResolutionService', () => ({
  entityResolutionService: {
    listEntities: vi.fn().mockResolvedValue([]),
    getEntityResolutionDashboard: vi.fn().mockResolvedValue({}),
    listEntityConflicts: vi.fn().mockResolvedValue([]),
    listEntityMergeHistory: vi.fn().mockResolvedValue([]),
    mergeEntities: vi.fn().mockResolvedValue(undefined),
    revertEntityMerge: vi.fn().mockResolvedValue(undefined),
    editEntity: vi.fn().mockResolvedValue(undefined),
    dismissConflict: vi.fn().mockResolvedValue(undefined),
    relinkExtractedUnits: vi.fn().mockResolvedValue(undefined),
    createEntityFromClarification: vi.fn().mockResolvedValue({ entity_id: 'e1', entity_type: 'CHARACTER' }),
  },
}));
vi.mock('../../src/services/continuityService', () => ({
  continuityService: { emitEvent: vi.fn().mockResolvedValue(undefined) },
}));

import { requireAuth } from '../../src/middleware/auth';
import entityResolutionRouter from '../../src/routes/entityResolution';

const app = express();
app.use(express.json());
app.use('/api/entity-resolution', entityResolutionRouter);

describe('EntityResolution API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /dashboard returns data', async () => {
    const res = await request(app).get('/api/entity-resolution/dashboard').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });

  it('GET /entities returns entities', async () => {
    const res = await request(app).get('/api/entity-resolution/entities').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('entities');
  });

  it('GET /conflicts returns conflicts', async () => {
    const res = await request(app).get('/api/entity-resolution/conflicts').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('GET /merge-history returns history', async () => {
    const res = await request(app).get('/api/entity-resolution/merge-history').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /disambiguate with action SKIP returns success', async () => {
    const res = await request(app)
      .post('/api/entity-resolution/disambiguate')
      .send({ mention_text: 'Bob', action: 'SKIP' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

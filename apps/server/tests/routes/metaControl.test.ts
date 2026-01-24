import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/metaControlService', () => ({
  metaControlService: {
    createMetaOverride: vi.fn().mockResolvedValue({}),
    listMetaOverrides: vi.fn().mockResolvedValue([]),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import metaControlRouter from '../../src/routes/metaControl';

const app = express();
app.use(express.json());
app.use('/api/meta', metaControlRouter);

describe('MetaControl API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /override returns override', async () => {
    const res = await request(app)
      .post('/api/meta/override')
      .send({ scope: 'GLOBAL', override_type: 'NOT_IMPORTANT' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('override');
  });

  it('GET /overrides returns overrides', async () => {
    const res = await request(app).get('/api/meta/overrides').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('overrides');
  });
});

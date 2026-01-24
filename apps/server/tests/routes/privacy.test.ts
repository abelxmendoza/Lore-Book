import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { privacyRouter } from '../../src/routes/privacy';
import { requireAuth } from '../../src/middleware/auth';
import { privacyScopeService } from '../../src/services/privacyScopeService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/privacyScopeService');

const app = express();
app.use(express.json());
app.use('/api/privacy', privacyRouter);

describe('Privacy API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('PATCH /scope should update scope', async () => {
    vi.mocked(privacyScopeService.updateScope).mockResolvedValue({} as any);
    const res = await request(app)
      .patch('/api/privacy/scope')
      .send({ resource_type: 'entry', resource_id: 'e1', scope_type: 'PRIVATE' })
      .expect(200);
    expect(res.body).toHaveProperty('scoped_resource');
  });

  it('PATCH /scope should return 400 when missing fields', async () => {
    await request(app).patch('/api/privacy/scope').send({}).expect(400);
  });

  it('DELETE /resources/:type/:id should return success', async () => {
    vi.mocked(privacyScopeService.deleteResource).mockResolvedValue(undefined as any);
    const res = await request(app).delete('/api/privacy/resources/entry/e1').expect(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

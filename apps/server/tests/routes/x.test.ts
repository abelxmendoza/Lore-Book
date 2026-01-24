import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { xRouter } from '../../src/routes/x';
import { requireAuth } from '../../src/middleware/auth';
import { xService } from '../../src/services/xService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/xService');

const app = express();
app.use(express.json());
app.use('/api/x', xRouter);

describe('X API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /sync should return 201 on success', async () => {
    vi.mocked(xService.syncPosts).mockResolvedValue({ synced: 5 } as any);
    const res = await request(app)
      .post('/api/x/sync')
      .send({ handle: 'user' })
      .expect(201);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /sync should return 400 for invalid body', async () => {
    await request(app).post('/api/x/sync').send({}).expect(400);
  });
});

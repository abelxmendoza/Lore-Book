import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { namingRouter } from '../../src/routes/naming';
import { requireAuth } from '../../src/middleware/auth';
import { namingService } from '../../src/services/namingService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/namingService');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/naming', namingRouter);

describe('Naming API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /chapter-name should return 400 for invalid body', async () => {
    await request(app).post('/api/naming/chapter-name').send({}).expect(400);
  });

  it('POST /chapter-name should return 404 when chapter not found', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);
    await request(app)
      .post('/api/naming/chapter-name')
      .send({ chapterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
      .expect(404);
  });

  it('PATCH /chapter-name should return 400 for invalid body', async () => {
    await request(app).patch('/api/naming/chapter-name').send({}).expect(400);
  });
});

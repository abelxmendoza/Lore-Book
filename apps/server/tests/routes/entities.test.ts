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
vi.mock('../../src/services/embeddingService', () => ({ embeddingService: { embed: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

import entitiesRouter from '../../src/routes/entities';

const app = express();
app.use(express.json());
app.use('/api/entities', entitiesRouter);

describe('Entities API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /auto-update returns 400 when required fields missing', async () => {
    await request(app).post('/api/entities/auto-update').send({}).expect(400);
  });

  it('POST /auto-update returns 400 when conversation missing', async () => {
    await request(app)
      .post('/api/entities/auto-update')
      .send({ entity_type: 'character', entity_id: 'e1' })
      .expect(400);
  });
});

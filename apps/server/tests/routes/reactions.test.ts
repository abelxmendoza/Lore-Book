import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import reactionsRouter from '../../src/routes/reactions';
import { requireAuth } from '../../src/middleware/auth';
import { reactionService } from '../../src/services/reactionService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/reactionService');

const app = express();
app.use(express.json());
app.use('/api/reactions', reactionsRouter);

describe('Reactions API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return reactions', async () => {
    vi.mocked(reactionService.getReactions).mockResolvedValue([]);
    const res = await request(app).get('/api/reactions').expect(200);
    expect(res.body).toHaveProperty('reactions');
  });

  it('POST / should create reaction', async () => {
    vi.mocked(reactionService.createReaction).mockResolvedValue({ id: 'r1' } as any);
    const res = await request(app)
      .post('/api/reactions')
      .send({
        trigger_type: 'memory',
        trigger_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        reaction_type: 'emotional',
        reaction_label: 'anxiety',
      })
      .expect(201);
    expect(res.body).toHaveProperty('reaction');
  });

  it('POST / should return 400 for invalid body', async () => {
    await request(app).post('/api/reactions').send({ trigger_type: 'x' }).expect(400);
  });
});

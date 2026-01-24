import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryRecall/memoryRecallEngine', () => ({
  memoryRecallEngine: {
    executeRecall: vi.fn().mockResolvedValue({ entries: [], confidence: 0 }),
    executeRecallForChat: vi.fn().mockResolvedValue(''),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import memoryRecallRouter from '../../src/routes/memoryRecall';

const app = express();
app.use(express.json());
app.use('/api/memory-recall', memoryRecallRouter);

describe('MemoryRecall API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /query returns result', async () => {
    const res = await request(app)
      .post('/api/memory-recall/query')
      .send({ raw_text: 'what did I do last week?' })
      .expect(200);
    expect(res.body).toHaveProperty('entries');
  });

  it('POST /query returns 400 when raw_text missing', async () => {
    await request(app).post('/api/memory-recall/query').send({}).expect(400);
  });
});

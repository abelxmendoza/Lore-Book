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
vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    getPendingMRQ: vi.fn().mockResolvedValue([]),
    getProposal: vi.fn().mockResolvedValue({ id: 'p1', text: 'prop' }),
    approveProposal: vi.fn().mockResolvedValue({ id: 'd1' }),
    rejectProposal: vi.fn().mockResolvedValue({ id: 'd1' }),
    editProposal: vi.fn().mockResolvedValue({ id: 'd1' }),
  },
}));

import { memoryReviewQueueRouter } from '../../src/routes/memoryReviewQueue';

const app = express();
app.use(express.json());
app.use('/api/mrq', memoryReviewQueueRouter);

describe('MRQ API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /pending returns items', async () => {
    const res = await request(app).get('/api/mrq/pending').expect(200);
    expect(res.body).toHaveProperty('items');
  });

  it('GET /proposals/:id returns proposal', async () => {
    const res = await request(app).get('/api/mrq/proposals/p1').expect(200);
    expect(res.body).toHaveProperty('proposal');
  });

  it('POST /proposals/:id/approve succeeds', async () => {
    const res = await request(app).post('/api/mrq/proposals/p1/approve').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /proposals/:id/reject succeeds', async () => {
    const res = await request(app).post('/api/mrq/proposals/p1/reject').send({ reason: 'dup' }).expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /proposals/:id/edit requires new_text', async () => {
    await request(app).post('/api/mrq/proposals/p1/edit').send({}).expect(400);
  });

  it('POST /proposals/:id/edit succeeds with new_text', async () => {
    const res = await request(app)
      .post('/api/mrq/proposals/p1/edit')
      .send({ new_text: 'updated' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

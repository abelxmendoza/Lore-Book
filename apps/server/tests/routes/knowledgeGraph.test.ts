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
vi.mock('../../src/services/knowledgeGraphService', () => ({
  knowledgeGraphService: {
    getNeighbors: vi.fn().mockResolvedValue([]),
    getPath: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { journal_entry_id: 'e1' },
        error: null,
      }),
    }),
  },
}));

import { knowledgeGraphRouter } from '../../src/routes/knowledgeGraph';

const app = express();
app.use(express.json());
app.use('/api/graph', knowledgeGraphRouter);

describe('Knowledge Graph API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /path returns path when source and target provided', async () => {
    const res = await request(app)
      .get('/api/graph/path')
      .query({ source: 'c1', target: 'c2' })
      .expect(200);
    expect(res.body).toHaveProperty('path');
  });

  it('GET /path returns 400 without source and target', async () => {
    await request(app).get('/api/graph/path').expect(400);
  });
});

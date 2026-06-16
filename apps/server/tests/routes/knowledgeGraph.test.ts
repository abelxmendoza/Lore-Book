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

const mockAssertMemoryComponentOwned = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/tenantOwnership', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/tenantOwnership')>();
  return {
    ...actual,
    assertMemoryComponentOwned: mockAssertMemoryComponentOwned,
  };
});

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
import { TenantAccessError } from '../../src/lib/tenantOwnership';

const app = express();
app.use(express.json());
app.use('/api/graph', knowledgeGraphRouter);

describe('Knowledge Graph API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /path returns path when source and target provided', async () => {
    mockAssertMemoryComponentOwned.mockResolvedValue(undefined);
    const res = await request(app)
      .get('/api/graph/path')
      .query({ source: 'c1', target: 'c2' })
      .expect(200);
    expect(res.body).toHaveProperty('path');
    expect(mockAssertMemoryComponentOwned).toHaveBeenCalledWith('u1', 'c1');
    expect(mockAssertMemoryComponentOwned).toHaveBeenCalledWith('u1', 'c2');
  });

  it('GET /path returns 404 when component belongs to another user', async () => {
    mockAssertMemoryComponentOwned.mockRejectedValue(new TenantAccessError('Component not found'));
    const res = await request(app)
      .get('/api/graph/path')
      .query({ source: 'foreign-comp', target: 'c2' })
      .expect(404);
    expect(res.body.error).toBe('Component not found');
  });

  it('GET /path returns 400 without source and target', async () => {
    await request(app).get('/api/graph/path').expect(400);
  });
});

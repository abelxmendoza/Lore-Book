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
vi.mock('../../src/middleware/rbac', () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../src/lib/admin/getAdminMetrics', () => ({
  getAdminMetrics: vi.fn().mockResolvedValue({ users: 0, entries: 0 }),
}));
vi.mock('../../src/lib/admin/financeService', () => ({
  getFinanceMetrics: vi.fn().mockResolvedValue({}),
  getMonthlyFinancials: vi.fn().mockResolvedValue([]),
  getSubscriptions: vi.fn().mockResolvedValue([]),
  getPaymentEvents: vi.fn().mockResolvedValue([]),
  calculateLTV: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }) } },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((fn: (r: { data?: unknown; error?: unknown }) => unknown) =>
        Promise.resolve(fn({ data: [], error: null }))
      ),
    }),
  },
}));

import { adminRouter } from '../../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /metrics returns admin metrics', async () => {
    const res = await request(app).get('/api/admin/metrics').expect(200);
    expect(res.body).toBeDefined();
  });
});

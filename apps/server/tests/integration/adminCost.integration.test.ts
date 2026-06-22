import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const ADMIN_USER = { id: 'admin-user-1', email: 'admin@test.com' };

// Controllable admin gate so we can test both allow and deny.
const requireAdminImpl = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as express.Request & { user?: typeof ADMIN_USER }).user = ADMIN_USER;
    next();
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireAdmin: (req: unknown, res: unknown, next: () => void) => requireAdminImpl(req, res, next),
}));

const getCostSummaryMock = vi.fn();
const flushMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/services/costAttributionService', () => ({
  getCostSummary: (...a: unknown[]) => getCostSummaryMock(...a),
  costAttributionService: { flush: (...a: unknown[]) => flushMock(...a) },
}));

const getBudgetMock = vi.fn();
vi.mock('../../src/services/openaiBudgetService', () => ({
  getOpenAiBudgetSnapshot: (...a: unknown[]) => getBudgetMock(...a),
}));

import { adminRouter } from '../../src/routes/admin';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
}

const SAMPLE_SUMMARY = {
  rangeDays: 30,
  since: '2026-05-23',
  totalUsd: 1.23,
  totalCalls: 42,
  byOperation: [{ operation: 'chat', usd: 0.9, calls: 30, pctOfTotal: 73.2 }],
  byModel: [{ model: 'gpt-4o-mini', usd: 1.23, calls: 42 }],
  byDay: [{ day: '2026-06-22', usd: 1.23, calls: 42 }],
};

describe('GET /api/admin/cost (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminImpl.mockImplementation((_req, _res, next) => next());
    getCostSummaryMock.mockResolvedValue(SAMPLE_SUMMARY);
    getBudgetMock.mockResolvedValue({
      enabled: true,
      monthlyLimitUsd: 100,
      spentUsd: 10,
      remainingUsd: 90,
      percentUsed: 10,
    });
    flushMock.mockResolvedValue(undefined);
  });

  it('returns the cost summary + budget + derived fields for an admin', async () => {
    const res = await request(buildApp()).get('/api/admin/cost?days=30').expect(200);
    expect(res.body.totalUsd).toBe(1.23);
    expect(res.body.byOperation[0].operation).toBe('chat');
    expect(res.body.budget.enabled).toBe(true);
    expect(res.body.derived).toBeDefined();
    expect(res.body.derived.chatUsd).toBeCloseTo(0.9, 6);
    // flushes buffered deltas before reading so the dashboard is fresh
    expect(flushMock).toHaveBeenCalled();
  });

  it('clamps the days param to a sane range', async () => {
    await request(buildApp()).get('/api/admin/cost?days=9999').expect(200);
    expect(getCostSummaryMock).toHaveBeenCalledWith(365); // clamped max
  });

  it('still returns 200 when the budget snapshot is unavailable (null-safe)', async () => {
    getBudgetMock.mockRejectedValue(new Error('no platform_openai_spend table'));
    const res = await request(buildApp()).get('/api/admin/cost').expect(200);
    expect(res.body.totalUsd).toBe(1.23);
    expect(res.body.budget).toBeNull();
  });

  it('is admin-gated — a non-admin is rejected (403)', async () => {
    requireAdminImpl.mockImplementation((_req, res: any) => res.status(403).json({ error: 'Forbidden' }));
    await request(buildApp()).get('/api/admin/cost').expect(403);
    expect(getCostSummaryMock).not.toHaveBeenCalled();
  });
});

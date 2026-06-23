import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// Force a non-dev API env BEFORE any module (config) is imported. requireAdmin
// dev-bypasses when config.apiEnv === 'dev', which made these admin-gate
// assertions flaky under CI's worker scheduling (the per-file config/rbac mocks
// did not always apply, so the real requireAdmin saw apiEnv='dev' and allowed
// the request → 200 instead of 403). With apiEnv='production' the real
// middleware path denies a non-admin user deterministically, independent of
// whether the module mocks below take effect.
const { origApiEnv } = vi.hoisted(() => {
  const origApiEnv = process.env.API_ENV;
  process.env.API_ENV = 'production';
  return { origApiEnv };
});
// Restore so the process-global env change does not leak to other test files
// sharing this worker process.
afterAll(() => {
  if (origApiEnv === undefined) delete process.env.API_ENV;
  else process.env.API_ENV = origApiEnv;
});

const USER_A = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'a@test.com' };
const USER_B = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email: 'b@test.com' };

vi.mock('../../src/config', () => ({
  config: {
    port: 4000,
    supabaseUrl: 'http://test',
    openAiKey: 'test-key',
    supabaseServiceRoleKey: 'test-role',
    apiEnv: 'production',
    enableExperimental: false,
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireAdmin: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(403).json({ error: 'Forbidden' });
  },
  requireDevAccess: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    next();
  },
}));

vi.mock('../../src/services/cognitionHealthService', () => ({
  cognitionHealthService: { getReport: vi.fn().mockResolvedValue({ overallStatus: 'ok' }) },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../src/services/entityContinuityVerifier', () => ({
  entityContinuityVerifier: { verify: vi.fn().mockResolvedValue({ overallHealth: 'healthy' }) },
}));

vi.mock('../../src/services/ingestion/ingestionQueue', () => ({
  ingestionQueue: { stats: vi.fn().mockReturnValue({}) },
}));

import diagnosticsRouter from '../../src/routes/diagnostics';

function buildApp(user: typeof USER_A) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user?: typeof USER_A }).user = user;
    next();
  });
  app.use('/api/diagnostics', diagnosticsRouter);
  return app;
}

describe('Tenant isolation — diagnostics access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_EXPERIMENTAL = 'true';
  });

  it('User A cannot read User B continuity trace (403)', async () => {
    const app = buildApp(USER_A);
    const res = await request(app)
      .get(`/api/diagnostics/continuity-trace/${USER_B.id}`)
      .expect(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('User A cannot access intelligence-health (admin-only)', async () => {
    const app = buildApp(USER_A);
    await request(app).get('/api/diagnostics/intelligence-health').expect(403);
  });

  it('User A cannot access cognition-health (admin-only)', async () => {
    const app = buildApp(USER_A);
    await request(app).get('/api/diagnostics/cognition-health').expect(403);
  });
});

/**
 * Route integration: GET /api/ontology/compliance and /analytics via supertest.
 *
 * Verifies auth wiring, response envelope, and that the compliance/analytics
 * services are invoked with the authenticated user. Services are mocked — this
 * test owns the HTTP contract, not the audit internals.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

const { mockAudit, mockAnalytics } = vi.hoisted(() => ({
  mockAudit: vi.fn(),
  mockAnalytics: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'onto-user' };
    next();
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/services/ontology/ontologyComplianceService', () => ({
  ontologyComplianceService: { audit: (...args: unknown[]) => mockAudit(...args) },
}));

vi.mock('../../src/services/ontology/ontologyExplorerService', () => ({
  generateOntologyAnalytics: (...args: unknown[]) => mockAnalytics(...args),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

let app: Express;

beforeAll(async () => {
  const { ontologyRouter } = await import('../../src/routes/ontology');
  app = express();
  app.use(express.json());
  app.use('/api/ontology', ontologyRouter);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: String(err?.message ?? err) });
  });
});

describe('GET /api/ontology/compliance', () => {
  it('returns the compliance report for the authenticated user', async () => {
    const report = { issues: [], summary: { total: 0, byBook: {} } };
    mockAudit.mockResolvedValueOnce(report);

    const res = await request(app).get('/api/ontology/compliance').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.report).toEqual(report);
    expect(mockAudit).toHaveBeenCalledWith('onto-user');
  });
});

describe('GET /api/ontology/analytics', () => {
  it('returns ontology analytics envelope', async () => {
    mockAnalytics.mockResolvedValueOnce({ keywords: [], totals: { entries: 0 } });

    const res = await request(app).get('/api/ontology/analytics').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.analytics).toHaveProperty('keywords');
    expect(mockAnalytics).toHaveBeenCalled();
  });
});

describe('GET /api/ontology', () => {
  it('returns the full hierarchy + analytics for admins', async () => {
    mockAnalytics.mockResolvedValueOnce({ keywords: [] });

    const res = await request(app).get('/api/ontology').expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.hierarchy)).toBe(true);
    expect(res.body.hierarchy.length).toBeGreaterThan(0);
  });
});

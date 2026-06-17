import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: { id: string } }).user = { id: 'user-1' };
    next();
  },
}));

vi.mock('../../src/services/trust/trustCenterService', () => ({
  buildTrustOverview: vi.fn().mockResolvedValue({
    generated_at: '2026-06-17T12:00:00.000Z',
    user_id: 'user-1',
    overall_coverage_score: 62,
    coverage: [
      {
        domain: 'characters',
        entity_count: 142,
        evidence_count: 88,
        coverage_score: 71,
        confidence_distribution: { high: 40, medium: 60, low: 30, none: 12 },
        states: { known: 120, suggested: 15, unverified: 3, conflicted: 4, archived: 0 },
      },
    ],
    confidence: { average: 62, distribution: { high: 40, medium: 60, low: 30, none: 12 } },
    unknowns: [{ id: 'g1', kind: 'mentioned_person_no_profile', label: 'Tío Ray', prompt: 'Who is Tío Ray?', domain: 'characters', priority: 85 }],
    conflicts: [{ id: 'c1', kind: 'duplicate_entity', title: 'Duplicate relationship', reason: 'unresolved', domain: 'relationships', priority: 88 }],
    review_queue: [],
    state_totals: { known: 120, suggested: 15, unverified: 3, conflicted: 4, archived: 0 },
  }),
  getDomainTrustSummary: vi.fn().mockResolvedValue({
    domain: 'characters',
    entity_count: 142,
    evidence_count: 88,
    coverage_score: 71,
    confidence_distribution: { high: 40, medium: 60, low: 30, none: 12 },
    states: { known: 120, suggested: 15, unverified: 3, conflicted: 4, archived: 0 },
    unknowns: [{ id: 'g1', kind: 'mentioned_person_no_profile', label: 'Tío Ray', prompt: 'Who is Tío Ray?', domain: 'characters', priority: 85 }],
    review_items: [],
  }),
  TRUST_DOMAINS: ['characters', 'locations', 'organizations', 'projects', 'goals', 'skills', 'communities', 'relationships', 'events', 'households'],
}));

import { trustRouter } from '../../src/routes/trust';
import { buildTrustOverview } from '../../src/services/trust/trustCenterService';

describe('trust routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/trust', trustRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/trust/overview returns dashboard payload', async () => {
    const res = await request(app).get('/api/trust/overview');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.overall_coverage_score).toBe(62);
    expect(res.body.data.coverage).toHaveLength(1);
    expect(buildTrustOverview).toHaveBeenCalledWith('user-1');
  });

  it('GET /api/trust/unknowns returns gap list', async () => {
    const res = await request(app).get('/api/trust/unknowns');
    expect(res.status).toBe(200);
    expect(res.body.data.unknowns[0].label).toBe('Tío Ray');
  });

  it('GET /api/trust/domains/:domain validates domain', async () => {
    const bad = await request(app).get('/api/trust/domains/not-a-domain');
    expect(bad.status).toBe(400);

    const ok = await request(app).get('/api/trust/domains/characters');
    expect(ok.status).toBe(200);
    expect(ok.body.data.domain).toBe('characters');
  });
});

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/lifeArcService', () => ({
  lifeArcService: { getRecentLifeArc: vi.fn().mockResolvedValue({ timeframe: 'LAST_30_DAYS', event_groups: {}, narrative_summary: { text: '' }, change_signals: {} }) },
}));
vi.mock('../../src/services/analytics/relationshipAnalytics', () => ({
  getRelationshipAnalytics: vi.fn().mockResolvedValue({ nodes: [], edges: [], summary: {} }),
}));
vi.mock('../../src/services/continuity/continuityService', () => ({
  continuityService: {
    getContinuityEvents: vi.fn().mockResolvedValue([]),
    getGoals: vi.fn().mockResolvedValue({ active: [], abandoned: [] }),
    getContradictions: vi.fn().mockResolvedValue([]),
    runContinuityAnalysis: vi.fn().mockResolvedValue({
      events: [],
      summary: { contradictions: 0, abandonedGoals: 0, arcShifts: 0, identityDrifts: 0, emotionalTransitions: 0, thematicDrifts: 0 },
    }),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import { getDisabledRoutePaths, routeRegistry } from '../../src/routes/routeRegistry';
import lifeArcRecentRouter from '../../src/routes/lifeArcRecent';
import { continuityRouter } from '../../src/routes/continuity';

describe('Discovery Hub integration', () => {
  const mockUser = { id: 'discovery-user', email: 'd@test.com' };

  beforeAll(() => {
    vi.mocked(requireAuth).mockImplementation(async (req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('promotes Discovery Hub API routes to CORE_RUNTIME (available without experimental flag)', () => {
    const corePaths = routeRegistry
      .filter((e) => e.classification === 'CORE_RUNTIME')
      .map((e) => e.path);

    const discoveryPaths = [
      '/api/analytics',
      '/api/life-arc',
      '/api/mrq',
      '/api/habits',
      '/api/values',
      '/api/decisions',
      '/api/essence',
      '/api/reactions',
      '/api/perception-reaction-engine',
      '/api/achievements',
      '/api/continuity',
    ];

    for (const path of discoveryPaths) {
      expect(corePaths, `${path} should be CORE_RUNTIME`).toContain(path);
    }

    const disabled = getDisabledRoutePaths();
    for (const path of discoveryPaths) {
      expect(disabled, `${path} should not be disabled`).not.toContain(path);
    }
  });

  it('life arc recent endpoint returns narrative payload', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/life-arc', lifeArcRecentRouter);

    const res = await request(app).get('/api/life-arc/recent').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.timeframe).toBe('LAST_30_DAYS');
  });

  it('continuity dashboard endpoints respond with expected shapes', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/continuity', continuityRouter);

    const events = await request(app).get('/api/continuity/events?limit=20').expect(200);
    expect(events.body).toHaveProperty('events');
    expect(Array.isArray(events.body.events)).toBe(true);

    const goals = await request(app).get('/api/continuity/goals').expect(200);
    expect(goals.body).toHaveProperty('active');
    expect(goals.body).toHaveProperty('abandoned');

    const contradictions = await request(app).get('/api/continuity/contradictions').expect(200);
    expect(contradictions.body).toHaveProperty('contradictions');

    const run = await request(app).post('/api/continuity/run').expect(200);
    expect(run.body.success).toBe(true);
    expect(run.body).toHaveProperty('summary');
  });
});

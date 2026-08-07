import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syntheticUser = { id: '00000000-0000-4000-8000-000000000001' };

const { analyzeCrossRelationshipPatterns, evaluatePatternThreshold, from, results } = vi.hoisted(() => ({
  analyzeCrossRelationshipPatterns: vi.fn().mockResolvedValue(undefined),
  evaluatePatternThreshold: vi.fn().mockResolvedValue(undefined),
  from: vi.fn(),
  results: [] as Array<{ data?: unknown; error?: unknown; count?: number | null }>,
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = syntheticUser;
    next();
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from },
}));

vi.mock('../../src/services/knowledgeCrystallization/crystallizationService', () => ({
  evaluatePatternThreshold,
}));

vi.mock('../../src/services/knowledgeCrystallization/crossRelationshipAnalyzer', () => ({
  analyzeCrossRelationshipPatterns,
}));

import knowledgeRouter from '../../src/routes/knowledge';

const app = express();
app.use(express.json());
app.use('/api/knowledge', knowledgeRouter);

function thenableQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['eq', 'gte', 'order', 'limit', 'in', 'range']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

describe('Knowledge claims refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    results.length = 0;
    from.mockImplementation(() => ({
      select: vi.fn(() => thenableQuery(results.shift() ?? { data: [], error: null })),
    }));
  });

  it('rechecks eligible existing patterns without lowering their thresholds', async () => {
    results.push(
      { count: 2, data: null, error: null },
      {
        data: [{
          id: 'candidate-1',
          continuity_strength: 0.84,
          occurrence_count: 5,
          first_seen_at: '2026-01-01T00:00:00.000Z',
          last_seen_at: '2026-07-01T00:00:00.000Z',
        }],
        error: null,
      },
      { count: 3, data: null, error: null },
    );

    const response = await request(app)
      .post('/api/knowledge/claims/refresh')
      .expect(200);

    expect(evaluatePatternThreshold).toHaveBeenCalledWith({
      userId: syntheticUser.id,
      eventCandidateId: 'candidate-1',
      continuityStrength: 0.84,
      occurrenceCount: 5,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-07-01T00:00:00.000Z',
    });
    expect(analyzeCrossRelationshipPatterns).toHaveBeenCalledWith(syntheticUser.id);
    expect(response.body).toMatchObject({
      success: true,
      evaluated: 1,
      failed: 0,
      created: 1,
      total: 3,
    });
  });

  it('keeps scanning when one candidate evaluation fails', async () => {
    results.push(
      { count: 0, data: null, error: null },
      {
        data: [
          { id: 'candidate-1', continuity_strength: 0.9, occurrence_count: 5, first_seen_at: null, last_seen_at: null },
          { id: 'candidate-2', continuity_strength: 0.88, occurrence_count: 4, first_seen_at: null, last_seen_at: null },
        ],
        error: null,
      },
      { count: 1, data: null, error: null },
    );
    evaluatePatternThreshold
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce(undefined);

    const response = await request(app)
      .post('/api/knowledge/claims/refresh')
      .expect(200);

    expect(response.body).toMatchObject({ evaluated: 2, failed: 1, created: 1 });
  });
});

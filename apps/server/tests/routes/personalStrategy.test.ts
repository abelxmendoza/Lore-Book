import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/personalStrategy/stateEncoder', () => ({
  StateEncoder: vi.fn().mockImplementation(function (this: unknown) {
    return { encodeCurrentState: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('../../src/services/personalStrategy/decisionRL', () => ({
  DecisionRL: vi.fn().mockImplementation(function (this: unknown) {
    return {
      recommendAction: vi.fn().mockResolvedValue(null),
      recordActionOutcome: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));
vi.mock('../../src/services/personalStrategy/rewardEngine', () => ({
  RewardEngine: vi.fn().mockImplementation(function () { return {}; }),
}));
vi.mock('../../src/services/personalStrategy/actionSpace', () => ({
  ActionSpace: vi.fn().mockImplementation(function () { return {}; }),
}));

import { requireAuth } from '../../src/middleware/auth';
import { personalStrategyRouter } from '../../src/routes/personalStrategy';

const app = express();
app.use(express.json());
app.use('/api/strategy', personalStrategyRouter);

describe('PersonalStrategy API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /state returns state', async () => {
    const res = await request(app).get('/api/strategy/state').expect(200);
    expect(res.body).toHaveProperty('state');
  });

  it('GET /recommendation returns recommendation', async () => {
    const res = await request(app).get('/api/strategy/recommendation').expect(200);
    expect(res.body).toHaveProperty('recommendation');
  });

  it('POST /action returns success', async () => {
    const res = await request(app)
      .post('/api/strategy/action')
      .send({ action_type: 'test' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

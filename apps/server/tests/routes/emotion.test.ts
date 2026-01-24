import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/emotionalIntelligence/eqEngine', () => ({
  EQEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ signals: [], triggers: [], reactions: [], regulation: {}, insights: [] }) };
  }),
}));
vi.mock('../../src/services/emotionalIntelligence/eqStorage', () => ({
  EQStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getEmotionSignals: vi.fn().mockResolvedValue([]),
      getTriggerEvents: vi.fn().mockResolvedValue([]),
      getReactionPatterns: vi.fn().mockResolvedValue([]),
      saveEmotionSignals: vi.fn().mockResolvedValue([]),
      saveTriggerEvents: vi.fn().mockResolvedValue([]),
      saveReactionPatterns: vi.fn().mockResolvedValue([]),
      saveRegulationScore: vi.fn().mockResolvedValue(null),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import emotionRouter from '../../src/routes/emotion';

const app = express();
app.use(express.json());
app.use('/api/emotion', emotionRouter);

describe('Emotion API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /eq/analyze should return result', async () => {
    const res = await request(app).post('/api/emotion/eq/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('signals');
  });

  it('GET /signals should return signals', async () => {
    const res = await request(app).get('/api/emotion/signals').expect(200);
    expect(res.body).toHaveProperty('signals');
  });

  it('GET /triggers should return triggers', async () => {
    const res = await request(app).get('/api/emotion/triggers').expect(200);
    expect(res.body).toHaveProperty('triggers');
  });
});

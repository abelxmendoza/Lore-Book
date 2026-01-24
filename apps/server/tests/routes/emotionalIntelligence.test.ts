import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/emotionalIntelligence/emotionalEngine', () => ({
  emotionalIntelligenceEngine: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/services/emotionalIntelligence/storeEvent', () => ({
  getAllEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    }),
  },
}));

import emotionalIntelligenceRouter from '../../src/routes/emotionalIntelligence';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/emotions', emotionalIntelligenceRouter);

describe('EmotionalIntelligence API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result with entry and user', async () => {
    const res = await request(app)
      .post('/api/emotions/analyze')
      .send({ entry: { id: 'e1' }, user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /analyze returns 400 when entry or user missing', async () => {
    await request(app).post('/api/emotions/analyze').send({}).expect(400);
  });

  it('GET /events returns events', async () => {
    const res = await request(app).get('/api/emotions/events').expect(200);
    expect(res.body).toHaveProperty('events');
  });

  it('GET /patterns returns patterns', async () => {
    const res = await request(app).get('/api/emotions/patterns').expect(200);
    expect(res.body).toBeDefined();
  });
});

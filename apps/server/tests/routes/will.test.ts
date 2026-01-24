import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'user-123', email: 'test@example.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));

vi.mock('../../src/services/will', () => {
  const mockInstance = {
    getWillEvents: vi.fn().mockResolvedValue([]),
    getAgencyMetrics: vi.fn().mockResolvedValue({ density: 0, trend: 'stable' }),
  };
  return {
    WillStorage: function (this: unknown) { return mockInstance; },
    WillEngine: function (this: unknown) {
      return { process: vi.fn().mockResolvedValue([]) };
    },
  };
});

vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    getEntry: vi.fn().mockResolvedValue({ id: 'e1', content: 'x', date: '2024-01-01', user_id: 'user-123' }),
  },
}));

import willRouter from '../../src/routes/will';

const app = express();
app.use(express.json());
app.use('/api/will', willRouter);

describe('Will API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /events returns will_events', async () => {
    const res = await request(app)
      .get('/api/will/events')
      .expect(200);
    expect(res.body).toHaveProperty('will_events');
    expect(Array.isArray(res.body.will_events)).toBe(true);
  });

  it('GET /events accepts timeWindow, minConfidence, limit', async () => {
    const res = await request(app)
      .get('/api/will/events?timeWindow=7&minConfidence=0.5&limit=10')
      .expect(200);
    expect(res.body).toHaveProperty('will_events');
  });

  it('GET /agency-metrics returns metrics', async () => {
    const res = await request(app)
      .get('/api/will/agency-metrics')
      .expect(200);
    expect(res.body).toHaveProperty('metrics');
  });

  it('GET /agency-metrics accepts timeWindow', async () => {
    const res = await request(app)
      .get('/api/will/agency-metrics?timeWindow=14')
      .expect(200);
    expect(res.body).toHaveProperty('metrics');
  });

  it('POST /process-entry requires entryId', async () => {
    await request(app)
      .post('/api/will/process-entry')
      .send({})
      .expect(400);
  });

  it('POST /process-entry returns will_events when entryId provided', async () => {
    const res = await request(app)
      .post('/api/will/process-entry')
      .send({ entryId: 'e1' })
      .expect(200);
    expect(res.body).toHaveProperty('will_events');
  });

  it('POST /process-entry returns 404 when entry not found', async () => {
    const { memoryService } = await import('../../src/services/memoryService');
    vi.mocked(memoryService.getEntry).mockResolvedValueOnce(null);
    await request(app)
      .post('/api/will/process-entry')
      .send({ entryId: 'nonexistent' })
      .expect(404);
  });
});

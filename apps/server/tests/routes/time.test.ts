import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/time/timeEngine', () => ({
  TimeEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ events: [], blocks: [], procrastination: [], energy: {}, score: {}, insights: [] }) };
  }),
}));
vi.mock('../../src/services/time/timeStorage', () => ({
  TimeStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getTimeEvents: vi.fn().mockResolvedValue([]),
      getTimeBlocks: vi.fn().mockResolvedValue([]),
      getProcrastinationSignals: vi.fn().mockResolvedValue([]),
      getLatestEnergyCurve: vi.fn().mockResolvedValue([]),
      getLatestTimeScore: vi.fn().mockResolvedValue(null),
      getStats: vi.fn().mockResolvedValue({}),
      saveTimeEvents: vi.fn().mockResolvedValue([]),
      saveTimeBlocks: vi.fn().mockResolvedValue([]),
      saveProcrastinationSignals: vi.fn().mockResolvedValue([]),
      saveEnergyCurve: vi.fn().mockResolvedValue(undefined),
      saveTimeScore: vi.fn().mockResolvedValue(null),
      saveInsights: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { requireAuth } from '../../src/middleware/auth';
import timeRouter from '../../src/routes/time';

const app = express();
app.use(express.json());
app.use('/api/time', timeRouter);

describe('Time API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/time/analyze', () => {
    it('should return analysis result', async () => {
      const response = await request(app).post('/api/time/analyze').send({}).expect(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('blocks');
    });
  });

  describe('GET /api/time/events', () => {
    it('should return events', async () => {
      const response = await request(app).get('/api/time/events').expect(200);
      expect(response.body).toHaveProperty('events');
    });
  });

  describe('GET /api/time/blocks', () => {
    it('should return blocks', async () => {
      const response = await request(app).get('/api/time/blocks').expect(200);
      expect(response.body).toHaveProperty('blocks');
    });
  });
});

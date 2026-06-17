import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/lifeArcService', () => ({
  lifeArcService: {
    getRecentLifeArc: vi.fn(),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import { lifeArcService } from '../../src/services/lifeArcService';
import lifeArcRecentRouter from '../../src/routes/lifeArcRecent';

const app = express();
app.use(express.json());
app.use('/api/life-arc', lifeArcRecentRouter);

describe('Life Arc Recent API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  const mockArc = {
    timeframe: 'LAST_30_DAYS',
    event_groups: {
      significant_events: [],
      recurring_patterns: [],
      new_entities: [],
      unresolved_events: [],
    },
    narrative_summary: { text: 'A quiet month.', event_ids: [], confidence: 0.8 },
    change_signals: {
      first_time_people: [],
      first_time_locations: [],
      pattern_shifts: [],
      emotional_shifts: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(async (req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
    vi.mocked(lifeArcService.getRecentLifeArc).mockResolvedValue(mockArc as any);
  });

  it('GET /recent returns life arc narrative', async () => {
    const res = await request(app)
      .get('/api/life-arc/recent?timeframe=LAST_30_DAYS')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, timeframe: 'LAST_30_DAYS' });
    expect(lifeArcService.getRecentLifeArc).toHaveBeenCalledWith('u1', 'LAST_30_DAYS');
  });

  it('GET /recent defaults timeframe to LAST_30_DAYS', async () => {
    await request(app).get('/api/life-arc/recent').expect(200);
    expect(lifeArcService.getRecentLifeArc).toHaveBeenCalledWith('u1', 'LAST_30_DAYS');
  });

  it('GET /recent rejects invalid timeframe', async () => {
    await request(app).get('/api/life-arc/recent?timeframe=INVALID').expect(400);
    expect(lifeArcService.getRecentLifeArc).not.toHaveBeenCalled();
  });

  it('GET /recent returns 500 when service fails', async () => {
    vi.mocked(lifeArcService.getRecentLifeArc).mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/api/life-arc/recent').expect(500);
    expect(res.body).toMatchObject({ success: false });
  });
});

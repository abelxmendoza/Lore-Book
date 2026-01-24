import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { autopilotRouter } from '../../src/routes/autopilot';
import { requireAuth } from '../../src/middleware/auth';
import { autopilotService } from '../../src/services/autopilotService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/autopilotService', () => ({
  autopilotService: {
    getDailyPlan: vi.fn(),
    getWeeklyStrategy: vi.fn(),
    getMonthlyCorrection: vi.fn(),
    getTransition: vi.fn(),
    getAlerts: vi.fn(),
    getMomentum: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/autopilot', autopilotRouter);

describe('Autopilot API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/autopilot/daily', () => {
    it('should return daily plan as JSON', async () => {
      vi.mocked(autopilotService.getDailyPlan).mockResolvedValue({ tasks: [], plan: 'Plan' } as any);

      const response = await request(app)
        .get('/api/autopilot/daily')
        .set('Accept', 'application/json')
        .expect(200);
      expect(response.body).toEqual({ tasks: [], plan: 'Plan' });
      expect(autopilotService.getDailyPlan).toHaveBeenCalledWith('user-123', 'json');
    });
  });

  describe('GET /api/autopilot/weekly', () => {
    it('should return weekly strategy', async () => {
      vi.mocked(autopilotService.getWeeklyStrategy).mockResolvedValue({ strategy: 'Weekly' } as any);

      const response = await request(app)
        .get('/api/autopilot/weekly')
        .set('Accept', 'application/json')
        .expect(200);
      expect(response.body).toHaveProperty('strategy');
      expect(autopilotService.getWeeklyStrategy).toHaveBeenCalledWith('user-123', expect.any(String));
    });
  });
});

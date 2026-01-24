import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import achievementsRouter from '../../src/routes/achievements';
import { requireAuth } from '../../src/middleware/auth';
import { achievementService } from '../../src/services/achievements/achievementService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/achievements/achievementService', () => ({
  achievementService: {
    getAchievements: vi.fn(),
    getTemplates: vi.fn(),
    checkAchievements: vi.fn(),
    getStatistics: vi.fn(),
    createRealLifeAchievement: vi.fn(),
    calculateRarityPreview: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/achievements', achievementsRouter);

describe('Achievements API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/achievements', () => {
    it('should return achievements for user', async () => {
      const mockAchievements = [{ id: 'a1', achievement_name: 'First', user_id: 'user-123' }];
      vi.mocked(achievementService.getAchievements).mockResolvedValue(mockAchievements as any);

      const response = await request(app).get('/api/achievements').expect(200);
      expect(response.body).toEqual({ achievements: mockAchievements });
      expect(achievementService.getAchievements).toHaveBeenCalledWith('user-123', expect.any(Object));
    });
  });

  describe('GET /api/achievements/templates', () => {
    it('should return achievement templates', async () => {
      const mockTemplates = [{ id: 't1', achievement_name: 'Template' }];
      vi.mocked(achievementService.getTemplates).mockResolvedValue(mockTemplates as any);

      const response = await request(app).get('/api/achievements/templates').expect(200);
      expect(response.body).toEqual({ templates: mockTemplates });
    });
  });

  describe('POST /api/achievements/check', () => {
    it('should check and return unlocked achievements', async () => {
      vi.mocked(achievementService.checkAchievements).mockResolvedValue([]);

      const response = await request(app).post('/api/achievements/check').expect(200);
      expect(response.body).toHaveProperty('unlocked');
      expect(response.body).toHaveProperty('count', 0);
      expect(achievementService.checkAchievements).toHaveBeenCalledWith('user-123');
    });
  });
});

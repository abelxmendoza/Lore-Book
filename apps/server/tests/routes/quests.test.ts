import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { questRouter } from '../../src/routes/quests';
import { requireAuth } from '../../src/middleware/auth';
import { questStorage } from '../../src/services/quests';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/quests', () => ({
  questService: { create: vi.fn(), update: vi.fn() },
  questStorage: {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    getQuestHistory: vi.fn(),
    getDependencies: vi.fn(),
  },
  questLinker: {},
  questExtractor: {},
}));

const app = express();
app.use(express.json());
app.use('/api/quests', questRouter);

describe('Quests API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
    vi.mocked(questStorage.getQuests).mockResolvedValue([]);
  });

  describe('GET /api/quests', () => {
    it('should return quests list', async () => {
      const response = await request(app).get('/api/quests').expect(200);
      expect(response.body).toHaveProperty('quests');
      expect(response.body).toHaveProperty('count', 0);
      expect(questStorage.getQuests).toHaveBeenCalledWith('user-123', {});
    });
  });
});

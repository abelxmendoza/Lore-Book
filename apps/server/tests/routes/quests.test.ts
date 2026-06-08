import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { questRouter } from '../../src/routes/quests';
import { requireAuth } from '../../src/middleware/auth';
import { questService, questStorage, questLinker, questExtractor } from '../../src/services/quests';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));
vi.mock('../../src/services/quests', () => ({
  questService: {
    createQuest: vi.fn(),
    updateQuest: vi.fn(),
    getQuestBoard: vi.fn(),
    getQuestAnalytics: vi.fn(),
  },
  questStorage: {
    getQuests: vi.fn(),
    getQuest: vi.fn(),
    getQuestHistory: vi.fn(),
    getDependencies: vi.fn(),
  },
  questLinker: {
    linkQuestToGoal: vi.fn(),
    linkQuestToTask: vi.fn(),
    convertGoalToQuest: vi.fn(),
    convertTaskToQuest: vi.fn(),
  },
  questExtractor: {
    extractQuests: vi.fn(),
  },
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

  // ── Route resolution (Sprint S — these literal routes used to be shadowed
  // by `/:id`, which captured them as id="board"/"analytics"/etc. and
  // returned 404 "Quest not found" instead of reaching their handlers) ──────

  describe('Route resolution — literal paths must not be captured by /:id', () => {
    it('GET /api/quests/board reaches getQuestBoard, not getQuest', async () => {
      vi.mocked(questService.getQuestBoard).mockResolvedValue({
        todays_quests: [], this_weeks_quests: [], main_quests: [], side_quests: [],
        daily_quests: [], completed_quests: [], total_count: 0,
      } as any);

      const response = await request(app).get('/api/quests/board').expect(200);

      expect(questService.getQuestBoard).toHaveBeenCalledWith('user-123');
      expect(questStorage.getQuest).not.toHaveBeenCalled();
      expect(response.body).toHaveProperty('total_count', 0);
    });

    it('GET /api/quests/analytics reaches getQuestAnalytics, not getQuest', async () => {
      vi.mocked(questService.getQuestAnalytics).mockResolvedValue({ total_quests: 0 } as any);

      const response = await request(app).get('/api/quests/analytics').expect(200);

      expect(questService.getQuestAnalytics).toHaveBeenCalledWith('user-123');
      expect(questStorage.getQuest).not.toHaveBeenCalled();
      expect(response.body).toHaveProperty('total_quests', 0);
    });

    it('GET /api/quests/suggestions reaches questExtractor.extractQuests, not getQuest', async () => {
      vi.mocked(questExtractor.extractQuests).mockResolvedValue([]);

      const response = await request(app).get('/api/quests/suggestions').expect(200);

      expect(questExtractor.extractQuests).toHaveBeenCalledWith('user-123', []);
      expect(questStorage.getQuest).not.toHaveBeenCalled();
      expect(response.body).toHaveProperty('suggestions');
    });

    it('GET /api/quests/completed reaches getQuests with status filter, not getQuest', async () => {
      const response = await request(app).get('/api/quests/completed').expect(200);

      expect(questStorage.getQuests).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ status: 'completed' })
      );
      expect(questStorage.getQuest).not.toHaveBeenCalled();
      expect(response.body).toHaveProperty('quests');
    });

    it('GET /api/quests/:id still resolves an actual quest by id (regression guard)', async () => {
      vi.mocked(questStorage.getQuest).mockResolvedValue({ id: 'quest-1', title: 'Real quest' } as any);
      vi.mocked(questStorage.getQuestHistory).mockResolvedValue([]);
      vi.mocked(questStorage.getDependencies).mockResolvedValue([]);

      const response = await request(app).get('/api/quests/quest-1').expect(200);

      expect(questStorage.getQuest).toHaveBeenCalledWith('user-123', 'quest-1');
      expect(response.body.quest).toEqual({ id: 'quest-1', title: 'Real quest' });
    });
  });

  // ── Link routes (Sprint S — frontend called /link/goal /link/task; ────────
  // backend only registered /link-goal /link-task) ──────────────────────────

  describe('Link routes — frontend/backend URL convention agreement', () => {
    it('POST /api/quests/:id/link-goal calls questLinker.linkQuestToGoal', async () => {
      vi.mocked(questLinker.linkQuestToGoal).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/quests/quest-1/link-goal')
        .send({ goal_id: 'goal-1' })
        .expect(200);

      expect(questLinker.linkQuestToGoal).toHaveBeenCalledWith('user-123', 'quest-1', 'goal-1');
      expect(response.body).toEqual({ success: true });
    });

    it('POST /api/quests/:id/link-task calls questLinker.linkQuestToTask', async () => {
      vi.mocked(questLinker.linkQuestToTask).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/quests/quest-1/link-task')
        .send({ task_id: 'task-1' })
        .expect(200);

      expect(questLinker.linkQuestToTask).toHaveBeenCalledWith('user-123', 'quest-1', 'task-1');
      expect(response.body).toEqual({ success: true });
    });
  });

  // ── Convert routes (Sprint S — questLinker.convertGoalToQuest/ ────────────
  // convertTaskToQuest were fully implemented but had no API route) ─────────

  describe('Convert routes — wiring existing questLinker conversions to the API', () => {
    it('POST /api/quests/convert/goal/:goalId calls questLinker.convertGoalToQuest and returns the quest', async () => {
      const convertedQuest = { id: 'quest-99', title: 'From goal', source: 'imported' };
      vi.mocked(questLinker.convertGoalToQuest).mockResolvedValue(convertedQuest as any);

      const response = await request(app)
        .post('/api/quests/convert/goal/goal-1')
        .expect(200);

      expect(questLinker.convertGoalToQuest).toHaveBeenCalledWith('user-123', 'goal-1');
      expect(response.body).toEqual({ quest: convertedQuest });
    });

    it('POST /api/quests/convert/task/:taskId calls questLinker.convertTaskToQuest and returns the quest', async () => {
      const convertedQuest = { id: 'quest-100', title: 'From task', source: 'imported' };
      vi.mocked(questLinker.convertTaskToQuest).mockResolvedValue(convertedQuest as any);

      const response = await request(app)
        .post('/api/quests/convert/task/task-1')
        .expect(200);

      expect(questLinker.convertTaskToQuest).toHaveBeenCalledWith('user-123', 'task-1');
      expect(response.body).toEqual({ quest: convertedQuest });
    });
  });
});

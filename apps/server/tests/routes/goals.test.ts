import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { goalsRouter } from '../../src/routes/goals';
import { requireAuth } from '../../src/middleware/auth';
import { goalValueAlignmentService } from '../../src/services/goalValueAlignmentService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/goalValueAlignmentService');

const app = express();
app.use(express.json());
app.use('/api/goals', goalsRouter);

describe('Goals API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/goals/values', () => {
    it('should declare a value', async () => {
      const mockValue = { id: 'v1', name: 'Freedom', description: 'Value freedom', priority: 0.8 };
      vi.mocked(goalValueAlignmentService.declareValue).mockResolvedValue(mockValue as any);

      const response = await request(app)
        .post('/api/goals/values')
        .send({ name: 'Freedom', description: 'Value freedom', priority: 0.8 })
        .expect(200);

      expect(response.body).toEqual({ value: mockValue });
      expect(goalValueAlignmentService.declareValue).toHaveBeenCalledWith('user-123', {
        name: 'Freedom',
        description: 'Value freedom',
        priority: 0.8,
      });
    });

    it('should return 400 when name or description missing', async () => {
      await request(app)
        .post('/api/goals/values')
        .send({ name: 'x' })
        .expect(400);
      await request(app)
        .post('/api/goals/values')
        .send({ description: 'x' })
        .expect(400);
    });
  });

  describe('GET /api/goals/values', () => {
    it('should return values', async () => {
      const mockValues = [{ id: 'v1', name: 'Freedom' }];
      vi.mocked(goalValueAlignmentService.getValues).mockResolvedValue(mockValues as any);

      const response = await request(app)
        .get('/api/goals/values')
        .expect(200);

      expect(response.body).toEqual({ values: mockValues, count: 1 });
      expect(goalValueAlignmentService.getValues).toHaveBeenCalledWith('user-123', true);
    });

    it('should respect active_only=false', async () => {
      vi.mocked(goalValueAlignmentService.getValues).mockResolvedValue([]);

      await request(app)
        .get('/api/goals/values?active_only=false')
        .expect(200);

      expect(goalValueAlignmentService.getValues).toHaveBeenCalledWith('user-123', false);
    });
  });

  describe('POST /api/goals/goals', () => {
    it('should declare a goal', async () => {
      const mockGoal = { id: 'g1', title: 'Career', goal_type: 'CAREER', status: 'ACTIVE' };
      vi.mocked(goalValueAlignmentService.declareGoal).mockResolvedValue(mockGoal as any);

      const response = await request(app)
        .post('/api/goals/goals')
        .send({
          title: 'Career',
          description: 'Advance career',
          goal_type: 'CAREER',
          target_timeframe: 'MEDIUM',
        })
        .expect(200);

      expect(response.body).toHaveProperty('goal');
      expect(goalValueAlignmentService.declareGoal).toHaveBeenCalledWith('user-123', expect.any(Object));
    });

    it('should return 400 when required fields missing', async () => {
      await request(app)
        .post('/api/goals/goals')
        .send({ title: 'x' })
        .expect(400);
    });
  });

  describe('GET /api/goals/goals', () => {
    it('should return goals', async () => {
      const mockGoals = [{ id: 'g1', title: 'Career' }];
      vi.mocked(goalValueAlignmentService.getGoals).mockResolvedValue(mockGoals as any);

      const response = await request(app)
        .get('/api/goals/goals')
        .expect(200);

      expect(response.body).toEqual({ goals: mockGoals, count: 1 });
    });
  });

  describe('GET /api/goals/goals/:id', () => {
    it('should return goal with alignment', async () => {
      const mockGoal = { id: 'g1', title: 'Career', alignment: {} };
      vi.mocked(goalValueAlignmentService.getGoalWithAlignment).mockResolvedValue(mockGoal as any);

      const response = await request(app)
        .get('/api/goals/goals/g1')
        .expect(200);

      expect(response.body).toEqual(mockGoal);
    });

    it('should return 404 when goal not found', async () => {
      vi.mocked(goalValueAlignmentService.getGoalWithAlignment).mockResolvedValue(null);

      await request(app)
        .get('/api/goals/goals/nonexistent')
        .expect(404);
    });
  });

  describe('PATCH /api/goals/values/:id/priority', () => {
    it('should update value priority', async () => {
      const mockValue = { id: 'v1', priority: 0.9 };
      vi.mocked(goalValueAlignmentService.updateValuePriority).mockResolvedValue(mockValue as any);

      const response = await request(app)
        .patch('/api/goals/values/v1/priority')
        .send({ priority: 0.9 })
        .expect(200);

      expect(response.body).toEqual({ value: mockValue });
      expect(goalValueAlignmentService.updateValuePriority).toHaveBeenCalledWith('user-123', 'v1', 0.9);
    });

    it('should return 400 for invalid priority', async () => {
      await request(app)
        .patch('/api/goals/values/v1/priority')
        .send({ priority: 1.5 })
        .expect(400);
    });
  });

  describe('PATCH /api/goals/goals/:id/status', () => {
    it('should update goal status', async () => {
      const mockGoal = { id: 'g1', status: 'COMPLETED' };
      vi.mocked(goalValueAlignmentService.updateGoalStatus).mockResolvedValue(mockGoal as any);

      const response = await request(app)
        .patch('/api/goals/goals/g1/status')
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(response.body).toEqual({ goal: mockGoal });
    });

    it('should return 400 for invalid status', async () => {
      await request(app)
        .patch('/api/goals/goals/g1/status')
        .send({ status: 'INVALID' })
        .expect(400);
    });
  });

  describe('POST /api/goals/values/extract', () => {
    it('should extract values from conversations', async () => {
      const mockValues = [{ id: 'v1', name: 'Growth' }];
      vi.mocked(goalValueAlignmentService.extractValuesFromConversations).mockResolvedValue(mockValues as any);

      const response = await request(app)
        .post('/api/goals/values/extract')
        .expect(200);

      expect(response.body).toEqual({ values: mockValues, count: 1 });
    });
  });
});

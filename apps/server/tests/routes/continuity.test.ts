// =====================================================
// CONTINUITY ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { continuityRouter } from '../../src/routes/continuity';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/continuityService', () => ({
  continuityService: {
    listEvents: vi.fn(),
    explainEvent: vi.fn(),
    revertEvent: vi.fn(),
    getReversalLog: vi.fn(),
  },
}));
vi.mock('../../src/services/continuity/continuityService', () => ({
  continuityService: {
    getContinuityEvents: vi.fn(),
    getGoals: vi.fn(),
    getContradictions: vi.fn(),
    runContinuityAnalysis: vi.fn(),
  },
}));
vi.mock('../../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/continuity', continuityRouter);

describe('Continuity Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/continuity/events', () => {
    it('should list continuity events without filters (dashboard path)', async () => {
      const { continuityService: analysisService } = await import('../../src/services/continuity/continuityService');
      const mockEvents = [
        { id: 'event-1', event_type: 'contradiction', severity: 7, description: 'Test' },
        { id: 'event-2', event_type: 'identity_drift', severity: 6, description: 'Drift' },
      ];

      vi.mocked(analysisService.getContinuityEvents).mockResolvedValue(mockEvents as any);

      const response = await request(app)
        .get('/api/continuity/events')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body.events).toHaveLength(2);
      expect(analysisService.getContinuityEvents).toHaveBeenCalledWith('test-user-id', undefined, 50);
    });

    it('should filter by type via dashboard service', async () => {
      const { continuityService: analysisService } = await import('../../src/services/continuity/continuityService');
      vi.mocked(analysisService.getContinuityEvents).mockResolvedValue([]);

      await request(app)
        .get('/api/continuity/events?type=contradiction')
        .expect(200);

      expect(analysisService.getContinuityEvents).toHaveBeenCalledWith(
        'test-user-id',
        'contradiction',
        50
      );
    });

    it('should filter by severity via explainability service', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.listEvents).mockResolvedValue([]);

      await request(app)
        .get('/api/continuity/events?severity=high')
        .expect(200);

      expect(continuityService.listEvents).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ severity: 'high' })
      );
    });

    it('should filter by reversible via explainability service', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.listEvents).mockResolvedValue([]);

      await request(app)
        .get('/api/continuity/events?reversible=true')
        .expect(200);

      expect(continuityService.listEvents).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ reversible: true })
      );
    });
  });

  describe('GET /api/continuity/goals', () => {
    it('returns active and abandoned goals', async () => {
      const { continuityService: analysisService } = await import('../../src/services/continuity/continuityService');
      const mockGoals = {
        active: [],
        abandoned: [{ id: 'g1', event_type: 'abandoned_goal', description: 'Learn Spanish' }],
      };
      vi.mocked(analysisService.getGoals).mockResolvedValue(mockGoals as any);

      const response = await request(app).get('/api/continuity/goals').expect(200);
      expect(response.body.abandoned).toHaveLength(1);
    });
  });

  describe('GET /api/continuity/contradictions', () => {
    it('returns contradiction events', async () => {
      const { continuityService: analysisService } = await import('../../src/services/continuity/continuityService');
      vi.mocked(analysisService.getContradictions).mockResolvedValue([
        { id: 'c1', event_type: 'contradiction', description: 'Conflict' },
      ] as any);

      const response = await request(app).get('/api/continuity/contradictions').expect(200);
      expect(response.body.contradictions).toHaveLength(1);
    });
  });

  describe('POST /api/continuity/run', () => {
    it('triggers continuity analysis', async () => {
      const { continuityService: analysisService } = await import('../../src/services/continuity/continuityService');
      vi.mocked(analysisService.runContinuityAnalysis).mockResolvedValue({
        events: [],
        summary: {
          contradictions: 0,
          abandonedGoals: 0,
          arcShifts: 0,
          identityDrifts: 0,
          emotionalTransitions: 0,
          thematicDrifts: 0,
        },
      });

      const response = await request(app).post('/api/continuity/run').expect(200);
      expect(response.body.success).toBe(true);
      expect(analysisService.runContinuityAnalysis).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('GET /api/continuity/events/:id', () => {
    it('should get event explanation', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      const mockExplanation = {
        id: 'event-1',
        type: 'contradiction',
        explanation: 'This contradicts a previous statement',
        relatedContext: [],
      };

      vi.mocked(continuityService.explainEvent).mockResolvedValue(mockExplanation as any);

      const response = await request(app)
        .get('/api/continuity/events/event-1')
        .expect(200);

      expect(response.body).toHaveProperty('explanation');
      expect(continuityService.explainEvent).toHaveBeenCalledWith('event-1', 'test-user-id');
    });

    it('should return 404 if event not found', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.explainEvent).mockResolvedValue(null);

      await request(app)
        .get('/api/continuity/events/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/continuity/events/:id/revert', () => {
    it('should revert a reversible event', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      const mockReversal = {
        id: 'reversal-1',
        event_id: 'event-1',
        reason: 'User correction',
        timestamp: new Date().toISOString(),
      };

      vi.mocked(continuityService.revertEvent).mockResolvedValue(mockReversal as any);

      const response = await request(app)
        .post('/api/continuity/events/event-1/revert')
        .send({
          reason: 'User correction',
        })
        .expect(200);

      expect(response.body).toHaveProperty('reversal');
      expect(response.body).toHaveProperty('success', true);
      expect(continuityService.revertEvent).toHaveBeenCalledWith(
        'test-user-id',
        'event-1',
        'User correction'
      );
    });

    it('should validate reason is provided', async () => {
      await request(app)
        .post('/api/continuity/events/event-1/revert')
        .send({})
        .expect(400);
    });

    it('should return 400 if event cannot be reverted', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.revertEvent).mockResolvedValue(null);

      await request(app)
        .post('/api/continuity/events/event-1/revert')
        .send({
          reason: 'User correction',
        })
        .expect(400);
    });
  });
});

// =====================================================
// CONTINUITY ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { continuityRouter } from '../../src/routes/continuity';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/continuityService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

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
    it('should list continuity events without filters', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      const mockEvents = [
        { id: 'event-1', type: 'contradiction', severity: 'medium' },
        { id: 'event-2', type: 'identity_drift', severity: 'high' },
      ];

      vi.mocked(continuityService.listEvents).mockResolvedValue(mockEvents as any);

      const response = await request(app)
        .get('/api/continuity/events')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body.events).toHaveLength(2);
    });

    it('should filter by type', async () => {
      const { continuityService } = await import('../../src/services/continuityService');
      vi.mocked(continuityService.listEvents).mockResolvedValue([]);

      await request(app)
        .get('/api/continuity/events?type=contradiction')
        .expect(200);

      expect(continuityService.listEvents).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ type: 'contradiction' })
      );
    });

    it('should filter by severity', async () => {
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

    it('should filter by reversible', async () => {
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

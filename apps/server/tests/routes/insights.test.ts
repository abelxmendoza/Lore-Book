// =====================================================
// INSIGHTS ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { insightsRouter } from '../../src/routes/insights';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/insightReflectionService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

describe('Insights Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/insights/generate', () => {
    it('should generate insights', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      const mockInsights = [
        {
          id: 'insight-1',
          type: 'pattern',
          title: 'Test Insight',
          description: 'Test description',
        },
      ];

      vi.mocked(insightReflectionService.generateInsights).mockResolvedValue(mockInsights as any);

      const response = await request(app)
        .post('/api/insights/generate')
        .expect(200);

      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('count', 1);
      expect(response.body.insights).toHaveLength(1);
      expect(insightReflectionService.generateInsights).toHaveBeenCalledWith('test-user-id');
    });

    it('should handle errors', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.generateInsights).mockRejectedValue(new Error('Generation failed'));

      await request(app)
        .post('/api/insights/generate')
        .expect(500);
    });
  });

  describe('GET /api/insights', () => {
    it('should get insights without filters', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      const mockInsights = [
        { id: 'insight-1', type: 'pattern', title: 'Insight 1' },
        { id: 'insight-2', type: 'trend', title: 'Insight 2' },
      ];

      vi.mocked(insightReflectionService.getInsights).mockResolvedValue(mockInsights as any);

      const response = await request(app)
        .get('/api/insights')
        .expect(200);

      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('count', 2);
      expect(insightReflectionService.getInsights).toHaveBeenCalledWith('test-user-id', {});
    });

    it('should filter by type', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      const mockInsights = [{ id: 'insight-1', type: 'pattern', title: 'Insight 1' }];

      vi.mocked(insightReflectionService.getInsights).mockResolvedValue(mockInsights as any);

      await request(app)
        .get('/api/insights?type=pattern')
        .expect(200);

      expect(insightReflectionService.getInsights).toHaveBeenCalledWith(
        'test-user-id',
        { type: 'pattern' }
      );
    });

    it('should filter by scope', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.getInsights).mockResolvedValue([]);

      await request(app)
        .get('/api/insights?scope=personal')
        .expect(200);

      expect(insightReflectionService.getInsights).toHaveBeenCalledWith(
        'test-user-id',
        { scope: 'personal' }
      );
    });

    it('should filter by dismissed status', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.getInsights).mockResolvedValue([]);

      await request(app)
        .get('/api/insights?dismissed=false')
        .expect(200);

      expect(insightReflectionService.getInsights).toHaveBeenCalledWith(
        'test-user-id',
        { dismissed: false }
      );
    });

    it('should limit results', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.getInsights).mockResolvedValue([]);

      await request(app)
        .get('/api/insights?limit=10')
        .expect(200);

      expect(insightReflectionService.getInsights).toHaveBeenCalledWith(
        'test-user-id',
        { limit: 10 }
      );
    });

    it('should handle errors', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.getInsights).mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/insights')
        .expect(500);
    });
  });

  describe('GET /api/insights/:id', () => {
    it('should get insight explanation', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      const mockExplanation = {
        id: 'insight-1',
        title: 'Test Insight',
        description: 'Test description',
        evidence: [],
        confidence: 0.8,
      };

      vi.mocked(insightReflectionService.explainInsight).mockResolvedValue(mockExplanation as any);

      const response = await request(app)
        .get('/api/insights/insight-1')
        .expect(200);

      expect(response.body).toEqual(mockExplanation);
      expect(insightReflectionService.explainInsight).toHaveBeenCalledWith('insight-1', 'test-user-id');
    });

    it('should return 404 if insight not found', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.explainInsight).mockResolvedValue(null);

      await request(app)
        .get('/api/insights/non-existent')
        .expect(404);
    });

    it('should handle errors', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.explainInsight).mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/insights/insight-1')
        .expect(500);
    });
  });

  describe('POST /api/insights/:id/dismiss', () => {
    it('should dismiss an insight', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.dismissInsight).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/insights/insight-1/dismiss')
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(insightReflectionService.dismissInsight).toHaveBeenCalledWith('insight-1', 'test-user-id');
    });

    it('should handle errors', async () => {
      const { insightReflectionService } = await import('../../src/services/insightReflectionService');
      vi.mocked(insightReflectionService.dismissInsight).mockRejectedValue(new Error('Database error'));

      await request(app)
        .post('/api/insights/insight-1/dismiss')
        .expect(500);
    });
  });
});

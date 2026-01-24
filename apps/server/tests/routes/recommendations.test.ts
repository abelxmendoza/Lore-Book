import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import recommendationsRouter from '../../src/routes/recommendations';
import { requireAuth } from '../../src/middleware/auth';
import { recommendationStorageService } from '../../src/services/recommendation/storageService';

const { mockGetActive } = vi.hoisted(() => {
  const mockGetActive = vi.fn().mockResolvedValue({ recommendations: [], total: 0 });
  return { mockGetActive };
});

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/recommendation/recommendationEngine', () => ({
  RecommendationEngine: vi.fn().mockImplementation(function () {
    return {
      getActiveRecommendations: mockGetActive,
      markAsShown: vi.fn(),
      markAsDismissed: vi.fn(),
      markAsActedUpon: vi.fn(),
      generateRecommendations: vi.fn().mockResolvedValue([]),
    };
  }),
}));
vi.mock('../../src/services/recommendation/storageService', () => ({
  recommendationStorageService: {
    getRecommendationHistory: vi.fn(),
    saveRecommendations: vi.fn(),
    markAsExpired: vi.fn(),
    getStats: vi.fn(),
  },
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/recommendations', recommendationsRouter);

describe('Recommendations API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActive.mockResolvedValue({ recommendations: [], total: 0 });
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/recommendations', () => {
    it('should return active recommendations', async () => {
      const response = await request(app)
        .get('/api/recommendations')
        .expect(200);

      expect(response.body).toHaveProperty('recommendations');
      expect(mockGetActive).toHaveBeenCalledWith('user-123', 20);
    });
  });

  describe('GET /api/recommendations/history', () => {
    it('should return recommendation history', async () => {
      vi.mocked(recommendationStorageService.getRecommendationHistory).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/recommendations/history')
        .expect(200);

      expect(response.body).toHaveProperty('recommendations');
      expect(response.body).toHaveProperty('total');
      expect(recommendationStorageService.getRecommendationHistory).toHaveBeenCalledWith('user-123', 50);
    });
  });

  describe('GET /api/recommendations/stats', () => {
    it('should return recommendation stats', async () => {
      vi.mocked(recommendationStorageService.getStats).mockResolvedValue({ total: 0, shown: 0, dismissed: 0 } as any);

      const response = await request(app)
        .get('/api/recommendations/stats')
        .expect(200);

      expect(response.body).toHaveProperty('total');
    });
  });
});

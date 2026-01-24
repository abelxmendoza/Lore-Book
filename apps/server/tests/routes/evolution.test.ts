import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { evolutionRouter } from '../../src/routes/evolution';
import { requireAuth } from '../../src/middleware/auth';
import { evolutionService } from '../../src/services/evolutionService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/evolutionService');

const app = express();
app.use(express.json());
app.use('/api/evolution', evolutionRouter);

describe('Evolution API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/evolution', () => {
    it('should return evolution insights', async () => {
      const mockInsights = [{ period: '2024', themes: [] }];
      vi.mocked(evolutionService.analyze).mockResolvedValue(mockInsights as any);

      const response = await request(app).get('/api/evolution').expect(200);
      expect(response.body).toEqual({ insights: mockInsights });
      expect(evolutionService.analyze).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(evolutionService.analyze).mockRejectedValue(new Error('DB error'));
      await request(app).get('/api/evolution').expect(500);
    });
  });
});

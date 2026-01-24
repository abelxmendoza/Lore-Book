import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { predictionsRouter } from '../../src/routes/predictions';
import { requireAuth } from '../../src/middleware/auth';
import { predictiveContinuityService } from '../../src/services/predictiveContinuityService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/predictiveContinuityService');

const app = express();
app.use(express.json());
app.use('/api/predictions', predictionsRouter);

describe('Predictions API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/predictions', () => {
    it('should return predictions list', async () => {
      const list = [{ id: 'p1', content: 'X' }];
      vi.mocked(predictiveContinuityService.getPredictions).mockResolvedValue(list as any);

      const response = await request(app).get('/api/predictions').expect(200);
      expect(response.body).toMatchObject({ predictions: list, count: 1 });
    });
  });

  describe('POST /api/predictions/generate', () => {
    it('should return generated predictions', async () => {
      const preds = [{ id: 'p1' }];
      vi.mocked(predictiveContinuityService.generatePredictions).mockResolvedValue(preds as any);

      const response = await request(app)
        .post('/api/predictions/generate')
        .send({ message: 'context' })
        .expect(200);
      expect(response.body).toHaveProperty('predictions');
    });
  });

  describe('GET /api/predictions/:id', () => {
    it('should return explanation', async () => {
      const explanation = { prediction: 'X', evidence: [] };
      vi.mocked(predictiveContinuityService.explainPrediction).mockResolvedValue(explanation as any);

      const response = await request(app).get('/api/predictions/p1').expect(200);
      expect(response.body).toHaveProperty('disclaimer');
    });

    it('should return 404 when not found', async () => {
      vi.mocked(predictiveContinuityService.explainPrediction).mockResolvedValue(null);
      await request(app).get('/api/predictions/unknown').expect(404);
    });
  });

  describe('POST /api/predictions/:id/dismiss', () => {
    it('should dismiss prediction', async () => {
      vi.mocked(predictiveContinuityService.dismissPrediction).mockResolvedValue(undefined as any);
      const response = await request(app).post('/api/predictions/p1/dismiss').expect(200);
      expect(response.body).toEqual({ success: true });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { onboardingRouter } from '../../src/routes/onboarding';
import { requireAuth } from '../../src/middleware/auth';
import { onboardingService } from '../../src/services/onboardingService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/onboardingService', () => ({
  onboardingService: {
    initialize: vi.fn(),
    importMemories: vi.fn(),
    generateBriefing: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/onboarding', onboardingRouter);

describe('Onboarding API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/onboarding/init', () => {
    it('should initialize onboarding', async () => {
      vi.mocked(onboardingService.initialize).mockResolvedValue({ success: true } as any);

      const response = await request(app).post('/api/onboarding/init').expect(201);
      expect(response.body).toHaveProperty('success');
      expect(onboardingService.initialize).toHaveBeenCalledWith('user-123');
    });
  });

  describe('GET /api/onboarding/briefing', () => {
    it('should return briefing', async () => {
      vi.mocked(onboardingService.generateBriefing).mockResolvedValue({ sections: [] } as any);

      const response = await request(app).get('/api/onboarding/briefing').expect(200);
      expect(onboardingService.generateBriefing).toHaveBeenCalledWith('user-123');
    });
  });
});

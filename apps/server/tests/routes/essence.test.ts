import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { essenceRouter } from '../../src/routes/essence';
import { requireAuth } from '../../src/middleware/auth';
import { essenceProfileService } from '../../src/services/essenceProfileService';
import { memoryService } from '../../src/services/memoryService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/essenceProfileService');
vi.mock('../../src/services/memoryService');

const app = express();
app.use(express.json());
app.use('/api/essence', essenceRouter);

describe('Essence API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/essence/profile', () => {
    it('should return essence profile', async () => {
      const mockProfile = { topSkills: [], values: [], themes: [] };
      vi.mocked(essenceProfileService.getProfile).mockResolvedValue(mockProfile as any);

      const response = await request(app)
        .get('/api/essence/profile')
        .expect(200);

      expect(response.body).toEqual({ profile: mockProfile });
      expect(essenceProfileService.getProfile).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle errors', async () => {
      vi.mocked(essenceProfileService.getProfile).mockRejectedValue(new Error('DB error'));

      await request(app)
        .get('/api/essence/profile')
        .expect(500);
    });
  });

  describe('POST /api/essence/extract', () => {
    it('should extract and return insights', async () => {
      vi.mocked(memoryService.searchEntries).mockResolvedValue([
        { id: '1', content: 'Entry', date: '2024-01-01', summary: null, user_id: 'user-123' },
      ] as any);
      vi.mocked(essenceProfileService.extractEssence).mockResolvedValue({ topSkills: [] } as any);
      vi.mocked(essenceProfileService.updateProfile).mockResolvedValue(undefined as any);

      const response = await request(app)
        .post('/api/essence/extract')
        .expect(200);

      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('updated', true);
    });

    it('should handle extract errors', async () => {
      vi.mocked(memoryService.searchEntries).mockRejectedValue(new Error('Search failed'));

      await request(app)
        .post('/api/essence/extract')
        .expect(500);
    });
  });

  describe('PUT /api/essence/skills', () => {
    it('should update skills with valid payload', async () => {
      vi.mocked(essenceProfileService.getProfile).mockResolvedValue({ topSkills: [] } as any);
      vi.mocked(essenceProfileService.updateProfile).mockResolvedValue(undefined as any);

      const response = await request(app)
        .put('/api/essence/skills')
        .send({ skills: [{ skill: 'Writing', confidence: 0.9 }] })
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should return 400 for invalid payload', async () => {
      await request(app)
        .put('/api/essence/skills')
        .send({ skills: 'not-an-array' })
        .expect(400);
    });
  });

  describe('GET /api/essence/evolution', () => {
    it('should return evolution timeline', async () => {
      const mockEvolution = [{ period: '2024', insights: [] }];
      vi.mocked(essenceProfileService.getEvolution).mockResolvedValue(mockEvolution as any);

      const response = await request(app)
        .get('/api/essence/evolution')
        .expect(200);

      expect(response.body).toHaveProperty('evolution', mockEvolution);
      expect(essenceProfileService.getEvolution).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle errors', async () => {
      vi.mocked(essenceProfileService.getEvolution).mockRejectedValue(new Error('DB error'));

      await request(app)
        .get('/api/essence/evolution')
        .expect(500);
    });
  });

  describe('POST /api/essence/refine', () => {
    it('should accept valid refinement', async () => {
      const payload = {
        userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        insightId: 'ins-1',
        action: 'affirm',
        metadata: { reason: 'User confirmed', originalText: 'Skill' },
      };

      const response = await request(app)
        .post('/api/essence/refine')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('action', 'affirm');
    });

    it('should return 403 when userId does not match', async () => {
      await request(app)
        .post('/api/essence/refine')
        .send({
          userId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
          insightId: 'ins-1',
          action: 'affirm',
          metadata: { reason: 'x', originalText: 'y' },
        })
        .expect(403);
    });

    it('should return 400 for invalid payload', async () => {
      await request(app)
        .post('/api/essence/refine')
        .send({})
        .expect(400);
    });
  });
});

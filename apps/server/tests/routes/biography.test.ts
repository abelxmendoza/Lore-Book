// =====================================================
// BIOGRAPHY ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { biographyRouter } from '../../src/routes/biography';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies (ingestionPipeline first: it has a parse error; omegaChatService imports it)
vi.mock('../../src/services/conversationCentered/ingestionPipeline', () => ({
  ConversationIngestionPipeline: vi.fn(),
  conversationIngestionPipeline: { ingestMessage: vi.fn(), ingestFromChatMessage: vi.fn() },
}));
vi.mock('../../src/services/mainLifestoryService');
vi.mock('../../src/services/biographyGeneration');
vi.mock('../../src/services/lorebook/lorebookSearchParser');
vi.mock('../../src/services/lorebook/lorebookRecommendationEngine');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/biography', biographyRouter);

describe('Biography Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/biography/main-lifestory', () => {
    it('should return main lifestory biography', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      const mockBiography = {
        id: 'bio-1',
        user_id: 'test-user-id',
        biography_data: {
          title: 'My Life Story',
          chapters: [],
        },
      };

      vi.mocked(mainLifestoryService.getMainLifestory).mockResolvedValue(mockBiography as any);

      const response = await request(app)
        .get('/api/biography/main-lifestory')
        .expect(200);

      expect(response.body).toHaveProperty('biography');
      expect(response.body.biography).toEqual(mockBiography);
    });

    it('should return 404 if lifestory not found', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      vi.mocked(mainLifestoryService.getMainLifestory).mockResolvedValue(null);

      await request(app)
        .get('/api/biography/main-lifestory')
        .expect(404);
    });

    it('should handle errors', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      vi.mocked(mainLifestoryService.getMainLifestory).mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/biography/main-lifestory')
        .expect(500);
    });
  });

  describe('POST /api/biography/main-lifestory/regenerate', () => {
    it('should regenerate main lifestory', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      const mockBiography = {
        id: 'bio-1',
        user_id: 'test-user-id',
        biography_data: {
          title: 'My Life Story',
          chapters: [],
        },
      };

      vi.mocked(mainLifestoryService.ensureMainLifestory).mockResolvedValue(undefined);
      vi.mocked(mainLifestoryService.getMainLifestory).mockResolvedValue(mockBiography as any);

      const response = await request(app)
        .post('/api/biography/main-lifestory/regenerate')
        .expect(200);

      expect(response.body).toHaveProperty('biography');
      expect(response.body).toHaveProperty('message', 'Main lifestory regenerated');
      expect(mainLifestoryService.ensureMainLifestory).toHaveBeenCalledWith('test-user-id', true);
    });

    it('should handle errors', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      vi.mocked(mainLifestoryService.ensureMainLifestory).mockRejectedValue(new Error('Generation failed'));

      await request(app)
        .post('/api/biography/main-lifestory/regenerate')
        .expect(500);
    });
  });

  describe('POST /api/biography/main-lifestory/alternative', () => {
    it('should generate alternative version', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      const mockBiography = {
        id: 'bio-2',
        user_id: 'test-user-id',
        biography_data: {
          title: 'My Life Story (Safe Version)',
          chapters: [],
        },
      };

      vi.mocked(mainLifestoryService.generateAlternativeVersion).mockResolvedValue(mockBiography as any);

      const response = await request(app)
        .post('/api/biography/main-lifestory/alternative')
        .send({
          version: 'safe',
          tone: 'neutral',
          depth: 'detailed',
          audience: 'public',
        })
        .expect(200);

      expect(response.body).toHaveProperty('biography');
      expect(mainLifestoryService.generateAlternativeVersion).toHaveBeenCalledWith(
        'test-user-id',
        'safe',
        { tone: 'neutral', depth: 'detailed', audience: 'public' }
      );
    });

    it('should validate request body', async () => {
      await request(app)
        .post('/api/biography/main-lifestory/alternative')
        .send({ version: 'invalid' })
        .expect(400);
    });

    it('should handle optional parameters', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      const mockBiography = {
        id: 'bio-2',
        user_id: 'test-user-id',
        biography_data: { title: 'Test', chapters: [] },
      };

      vi.mocked(mainLifestoryService.generateAlternativeVersion).mockResolvedValue(mockBiography as any);

      await request(app)
        .post('/api/biography/main-lifestory/alternative')
        .send({ version: 'safe' })
        .expect(200);

      expect(mainLifestoryService.generateAlternativeVersion).toHaveBeenCalledWith(
        'test-user-id',
        'safe',
        {}
      );
    });
  });

  describe('GET /api/biography/sections', () => {
    it('should return biography sections', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      const mockBiography = {
        id: 'bio-1',
        user_id: 'test-user-id',
        biography_data: {
          title: 'My Life Story',
          chapters: [
            { id: 'ch-1', title: 'Chapter 1', content: 'Content 1' },
            { id: 'ch-2', title: 'Chapter 2', content: 'Content 2' },
          ],
        },
      };

      vi.mocked(mainLifestoryService.getMainLifestory).mockResolvedValue(mockBiography as any);

      const response = await request(app)
        .get('/api/biography/sections')
        .expect(200);

      expect(response.body).toHaveProperty('sections');
      expect(response.body.sections).toHaveLength(2);
      expect(response.body.sections[0]).toHaveProperty('title', 'Chapter 1');
    });

    it('should return empty array if no lifestory', async () => {
      const { mainLifestoryService } = await import('../../src/services/mainLifestoryService');
      vi.mocked(mainLifestoryService.getMainLifestory).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/biography/sections')
        .expect(200);

      expect(response.body).toEqual({ sections: [] });
    });
  });

  describe('POST /api/biography/generate', () => {
    it('should generate biography from spec', async () => {
      const { biographyGenerationEngine } = await import('../../src/services/biographyGeneration');
      const mockBiography = {
        id: 'bio-1',
        title: 'Generated Biography',
        chapters: [],
      };

      vi.mocked(biographyGenerationEngine.generateBiography).mockResolvedValue(mockBiography as any);

      const response = await request(app)
        .post('/api/biography/generate')
        .send({
          scope: 'full_life',
          tone: 'neutral',
          depth: 'detailed',
          audience: 'self',
          version: 'main',
        })
        .expect(200);

      expect(response.body).toHaveProperty('biography');
      expect(biographyGenerationEngine.generateBiography).toHaveBeenCalled();
    });

    it('should validate request body', async () => {
      await request(app)
        .post('/api/biography/generate')
        .send({ scope: 'invalid' })
        .expect(400);
    });

    it('should handle generation errors', async () => {
      const { biographyGenerationEngine } = await import('../../src/services/biographyGeneration');
      vi.mocked(biographyGenerationEngine.generateBiography).mockRejectedValue(new Error('Generation failed'));

      await request(app)
        .post('/api/biography/generate')
        .send({
          scope: 'full_life',
          tone: 'neutral',
          depth: 'detailed',
          audience: 'self',
          version: 'main',
        })
        .expect(500);
    });
  });

  describe('GET /api/biography/list', () => {
    it('should list all biographies', async () => {
      const { biographyGenerationEngine } = await import('../../src/services/biographyGeneration');
      const mockBiographies = [
        { id: 'bio-1', title: 'Biography 1' },
        { id: 'bio-2', title: 'Biography 2' },
      ];

      vi.mocked(biographyGenerationEngine.listBiographies).mockResolvedValue(mockBiographies as any);

      const response = await request(app)
        .get('/api/biography/list')
        .expect(200);

      expect(response.body).toHaveProperty('biographies');
      expect(response.body.biographies).toHaveLength(2);
    });

    it('should filter by coreOnly query param', async () => {
      const { biographyGenerationEngine } = await import('../../src/services/biographyGeneration');
      const mockBiographies = [{ id: 'bio-1', title: 'Core Biography' }];

      vi.mocked(biographyGenerationEngine.listBiographies).mockResolvedValue(mockBiographies as any);

      await request(app)
        .get('/api/biography/list?coreOnly=true')
        .expect(200);

      expect(biographyGenerationEngine.listBiographies).toHaveBeenCalledWith(
        'test-user-id',
        true
      );
    });
  });
});

// =====================================================
// CHAPTERS ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { chaptersRouter } from '../../src/routes/chapters';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/chapterService');
vi.mock('../../src/services/chapterInsightsService');
vi.mock('../../src/lib/openai.js');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/chapters', chaptersRouter);

describe('Chapters Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/chapters', () => {
    it('should create a chapter', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      const mockChapter = {
        id: 'ch-1',
        user_id: 'test-user-id',
        title: 'Test Chapter',
        start_date: '2024-01-01',
        end_date: null,
        description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(chapterService.createChapter).mockResolvedValue(mockChapter as any);

      const response = await request(app)
        .post('/api/chapters')
        .send({
          title: 'Test Chapter',
          startDate: '2024-01-01',
        })
        .expect(201);

      expect(response.body).toHaveProperty('chapter');
      expect(response.body.chapter.title).toBe('Test Chapter');
      expect(chapterService.createChapter).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          title: 'Test Chapter',
          start_date: '2024-01-01',
        })
      );
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/chapters')
        .send({})
        .expect(400);
    });

    it('should handle optional endDate and description', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      const mockChapter = {
        id: 'ch-1',
        user_id: 'test-user-id',
        title: 'Test Chapter',
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        description: 'Test description',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(chapterService.createChapter).mockResolvedValue(mockChapter as any);

      await request(app)
        .post('/api/chapters')
        .send({
          title: 'Test Chapter',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          description: 'Test description',
        })
        .expect(201);

      expect(chapterService.createChapter).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          end_date: '2024-12-31',
          description: 'Test description',
        })
      );
    });
  });

  describe('GET /api/chapters', () => {
    it('should list chapters and candidates', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      const { chapterInsightsService } = await import('../../src/services/chapterInsightsService');
      
      const mockChapters = [
        { id: 'ch-1', user_id: 'test-user-id', title: 'Chapter 1', start_date: '2024-01-01', end_date: null, description: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'ch-2', user_id: 'test-user-id', title: 'Chapter 2', start_date: '2024-01-01', end_date: null, description: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];
      const mockCandidates = [
        { id: 'cand-1', chapter_title: 'Candidate 1', confidence: 0.8 },
      ];

      vi.mocked(chapterService.listChapters).mockResolvedValue(mockChapters as any);
      vi.mocked(chapterInsightsService.detectCandidates).mockResolvedValue(mockCandidates as any);

      const response = await request(app)
        .get('/api/chapters')
        .expect(200);

      expect(response.body).toHaveProperty('chapters');
      expect(response.body).toHaveProperty('candidates');
      expect(response.body.chapters).toHaveLength(2);
      expect(response.body.candidates).toHaveLength(1);
    });
  });

  describe('GET /api/chapters/:id', () => {
    it('should get a chapter by id', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      const mockChapter = {
        id: 'ch-1',
        user_id: 'test-user-id',
        title: 'Test Chapter',
        start_date: '2024-01-01',
        end_date: null,
        description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(chapterService.getChapter).mockResolvedValue(mockChapter as any);

      const response = await request(app)
        .get('/api/chapters/ch-1')
        .expect(200);

      expect(response.body).toHaveProperty('chapter');
      expect(response.body.chapter.id).toBe('ch-1');
      expect(chapterService.getChapter).toHaveBeenCalledWith('test-user-id', 'ch-1');
    });

    it('should return 404 if chapter not found', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      vi.mocked(chapterService.getChapter).mockResolvedValue(null);

      await request(app)
        .get('/api/chapters/non-existent')
        .expect(404);
    });
  });

  describe('PATCH /api/chapters/:id', () => {
    it('should update a chapter', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      const mockChapter = {
        id: 'ch-1',
        user_id: 'test-user-id',
        title: 'Updated Chapter',
        start_date: '2024-01-01',
        end_date: null,
        description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(chapterService.updateChapter).mockResolvedValue(mockChapter as any);

      const response = await request(app)
        .patch('/api/chapters/ch-1')
        .send({
          title: 'Updated Chapter',
        })
        .expect(200);

      expect(response.body).toHaveProperty('chapter');
      expect(response.body.chapter.title).toBe('Updated Chapter');
      expect(chapterService.updateChapter).toHaveBeenCalledWith(
        'test-user-id',
        'ch-1',
        expect.objectContaining({ title: 'Updated Chapter' })
      );
    });

    it('should handle partial updates', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      const mockChapter = {
        id: 'ch-1',
        user_id: 'test-user-id',
        title: 'Test Chapter',
        start_date: '2024-01-01',
        end_date: null,
        description: 'Updated description',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(chapterService.updateChapter).mockResolvedValue(mockChapter as any);

      await request(app)
        .patch('/api/chapters/ch-1')
        .send({
          description: 'Updated description',
        })
        .expect(200);

      expect(chapterService.updateChapter).toHaveBeenCalledWith(
        'test-user-id',
        'ch-1',
        expect.objectContaining({ description: 'Updated description' })
      );
    });

    it('should return 404 if chapter not found', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      vi.mocked(chapterService.updateChapter).mockResolvedValue(null);

      await request(app)
        .patch('/api/chapters/non-existent')
        .send({ title: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/chapters/:id', () => {
    it('should delete a chapter', async () => {
      const { chapterService } = await import('../../src/services/chapterService');
      vi.mocked(chapterService.deleteChapter).mockResolvedValue(undefined);

      await request(app)
        .delete('/api/chapters/ch-1')
        .expect(204);

      expect(chapterService.deleteChapter).toHaveBeenCalledWith('test-user-id', 'ch-1');
    });
  });

  describe('POST /api/chapters/extract-info', () => {
    it('should extract chapter info from conversation', async () => {
      const { openai } = await import('../../src/lib/openai.js');
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant' as const,
            content: JSON.stringify({
              title: 'Extracted Chapter',
              startDate: '2024-01-01',
              endDate: '2024-12-31',
              description: 'Extracted description',
            }),
          },
        }],
      };

      vi.mocked(openai.chat.completions.create).mockResolvedValue(mockResponse as any);

      const response = await request(app)
        .post('/api/chapters/extract-info')
        .send({
          conversation: 'I started a new job in January 2024 and worked there all year.',
        })
        .expect(200);

      expect(response.body).toHaveProperty('chapter');
      expect(response.body.chapter).toHaveProperty('title', 'Extracted Chapter');
    });

    it('should validate conversation is provided', async () => {
      await request(app)
        .post('/api/chapters/extract-info')
        .send({})
        .expect(400);
    });

    it('should handle OpenAI errors', async () => {
      const { openai } = await import('../../src/lib/openai.js');
      vi.mocked(openai.chat.completions.create).mockRejectedValue(new Error('OpenAI error'));

      await request(app)
        .post('/api/chapters/extract-info')
        .send({
          conversation: 'Test conversation',
        })
        .expect(500);
    });
  });
});

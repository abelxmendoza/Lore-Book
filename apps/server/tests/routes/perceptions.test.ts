// =====================================================
// PERCEPTIONS ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import perceptionsRouter from '../../src/routes/perceptions';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/perceptionService');
vi.mock('../../src/services/perceptionChatService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/perceptions', perceptionsRouter);

describe('Perceptions Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/perceptions', () => {
    it('should create a perception entry', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      const mockPerception = {
        id: 'perception-1',
        user_id: 'test-user-id',
        subject_alias: 'John',
        content: 'I heard that John got a promotion',
        source: 'told_by',
        confidence_level: 0.5,
        impact_on_me: 'Happy for him',
      };

      vi.mocked(perceptionService.createPerceptionEntry).mockResolvedValue(mockPerception as any);

      const response = await request(app)
        .post('/api/perceptions')
        .send({
          subject_alias: 'John',
          content: 'I heard that John got a promotion',
          source: 'told_by',
          impact_on_me: 'Happy for him',
        })
        .expect(201);

      expect(response.body).toHaveProperty('perception');
      expect(response.body.perception.subject_alias).toBe('John');
    });

    it('should validate perception framing', async () => {
      await request(app)
        .post('/api/perceptions')
        .send({
          subject_alias: 'John',
          content: 'John got a promotion', // Not framed as perception
          source: 'told_by',
          impact_on_me: 'Happy',
        })
        .expect(400);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/perceptions')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/perceptions', () => {
    it('should get perceptions without filters', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      const mockPerceptions = [
        { id: 'perception-1', subject_alias: 'John', content: 'I heard...' },
        { id: 'perception-2', subject_alias: 'Jane', content: 'I thought...' },
      ];

      vi.mocked(perceptionService.getPerceptionEntries).mockResolvedValue(mockPerceptions as any);

      const response = await request(app)
        .get('/api/perceptions')
        .expect(200);

      expect(response.body).toHaveProperty('perceptions');
      expect(response.body.perceptions).toHaveLength(2);
    });

    it('should filter by subject_person_id', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      vi.mocked(perceptionService.getPerceptionEntries).mockResolvedValue([]);

      await request(app)
        .get('/api/perceptions?subject_person_id=person-123')
        .expect(200);

      expect(perceptionService.getPerceptionEntries).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ subject_person_id: 'person-123' })
      );
    });

    it('should filter by source', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      vi.mocked(perceptionService.getPerceptionEntries).mockResolvedValue([]);

      await request(app)
        .get('/api/perceptions?source=told_by')
        .expect(200);

      expect(perceptionService.getPerceptionEntries).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ source: 'told_by' })
      );
    });
  });

  describe('GET /api/perceptions/about/:personId', () => {
    it('should get perceptions about a person', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      const mockPerceptions = [
        { id: 'perception-1', subject_person_id: 'person-123', content: 'I heard...' },
      ];

      vi.mocked(perceptionService.getPerceptionsAboutPerson).mockResolvedValue(mockPerceptions as any);

      const response = await request(app)
        .get('/api/perceptions/about/person-123')
        .expect(200);

      expect(response.body).toHaveProperty('perceptions');
      expect(perceptionService.getPerceptionsAboutPerson).toHaveBeenCalledWith('test-user-id', 'person-123');
    });
  });

  describe('GET /api/perceptions/evolution/:personId', () => {
    it('should get perception evolution', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      const mockEvolution = [
        { id: 'perception-1', timestamp: '2024-01-01', content: 'I thought...' },
        { id: 'perception-2', timestamp: '2024-02-01', content: 'I now believe...' },
      ];

      vi.mocked(perceptionService.getPerceptionEvolution).mockResolvedValue(mockEvolution as any);

      const response = await request(app)
        .get('/api/perceptions/evolution/person-123')
        .expect(200);

      expect(response.body).toHaveProperty('perceptions');
      expect(perceptionService.getPerceptionEvolution).toHaveBeenCalledWith('test-user-id', 'person-123');
    });
  });

  describe('PATCH /api/perceptions/:id', () => {
    it('should update a perception entry', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      const mockPerception = {
        id: 'perception-1',
        status: 'confirmed',
        impact_on_me: 'Updated impact',
      };

      vi.mocked(perceptionService.updatePerceptionEntry).mockResolvedValue(mockPerception as any);

      const response = await request(app)
        .patch('/api/perceptions/perception-1')
        .send({
          status: 'confirmed',
          impact_on_me: 'Updated impact',
        })
        .expect(200);

      expect(response.body).toHaveProperty('perception');
      expect(perceptionService.updatePerceptionEntry).toHaveBeenCalledWith(
        'test-user-id',
        'perception-1',
        expect.objectContaining({ status: 'confirmed' })
      );
    });
  });

  describe('DELETE /api/perceptions/:id', () => {
    it('should delete a perception entry', async () => {
      const { perceptionService } = await import('../../src/services/perceptionService');
      vi.mocked(perceptionService.deletePerceptionEntry).mockResolvedValue(undefined);

      await request(app)
        .delete('/api/perceptions/perception-1')
        .expect(204);

      expect(perceptionService.deletePerceptionEntry).toHaveBeenCalledWith('test-user-id', 'perception-1');
    });
  });

  describe('POST /api/perceptions/extract-from-chat', () => {
    it('should extract perceptions from chat', async () => {
      const { perceptionChatService } = await import('../../src/services/perceptionChatService');
      const mockExtraction = {
        perceptions: [
          { subject_alias: 'John', content: 'I heard...', source: 'told_by' },
        ],
        charactersCreated: [],
        charactersLinked: [],
        needsFraming: false,
      };
      const mockCreated = [{ id: 'perception-1' }];

      vi.mocked(perceptionChatService.extractPerceptionsFromChat).mockResolvedValue(mockExtraction as any);
      vi.mocked(perceptionChatService.createPerceptionsFromExtraction).mockResolvedValue(mockCreated as any);

      const response = await request(app)
        .post('/api/perceptions/extract-from-chat')
        .send({
          message: 'I heard John got promoted',
        })
        .expect(200);

      expect(response.body).toHaveProperty('extraction');
      expect(response.body).toHaveProperty('created');
      expect(response.body).toHaveProperty('summary');
    });

    it('should validate message is provided', async () => {
      await request(app)
        .post('/api/perceptions/extract-from-chat')
        .send({})
        .expect(400);
    });
  });
});

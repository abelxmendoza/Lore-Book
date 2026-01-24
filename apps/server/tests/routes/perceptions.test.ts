import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import perceptionsRouter from '../../src/routes/perceptions';
import { requireAuth } from '../../src/middleware/auth';
import { perceptionService } from '../../src/services/perceptionService';
import { perceptionChatService } from '../../src/services/perceptionChatService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/perceptionService');
vi.mock('../../src/services/perceptionChatService');

const app = express();
app.use(express.json());
app.use('/api/perceptions', perceptionsRouter);

describe('Perceptions API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/perceptions', () => {
    it('should return perception entries', async () => {
      const mockList = [{ id: 'p1', subject_alias: 'Alice', content: 'I believed she was kind' }];
      vi.mocked(perceptionService.getPerceptionEntries).mockResolvedValue(mockList as any);

      const response = await request(app)
        .get('/api/perceptions')
        .expect(200);

      expect(response.body).toEqual({ perceptions: mockList });
      expect(perceptionService.getPerceptionEntries).toHaveBeenCalledWith(mockUser.id, {});
    });

    it('should pass query filters', async () => {
      vi.mocked(perceptionService.getPerceptionEntries).mockResolvedValue([]);
      await request(app)
        .get('/api/perceptions?subject_alias=Bob&source=overheard&limit=10')
        .expect(200);
      expect(perceptionService.getPerceptionEntries).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ subject_alias: 'Bob', source: 'overheard', limit: 10 })
      );
    });
  });

  describe('GET /api/perceptions/about/:personId', () => {
    it('should return perceptions about a person', async () => {
      const mockList = [{ id: 'p1', subject_alias: 'Alice' }];
      vi.mocked(perceptionService.getPerceptionsAboutPerson).mockResolvedValue(mockList as any);

      const response = await request(app)
        .get('/api/perceptions/about/person-uuid-1')
        .expect(200);

      expect(response.body).toEqual({ perceptions: mockList });
      expect(perceptionService.getPerceptionsAboutPerson).toHaveBeenCalledWith(mockUser.id, 'person-uuid-1');
    });
  });

  describe('GET /api/perceptions/evolution/:personId', () => {
    it('should return perception evolution', async () => {
      const mockEvolution = [{ version: 1, content: 'I believed...' }];
      vi.mocked(perceptionService.getPerceptionEvolution).mockResolvedValue(mockEvolution as any);

      const response = await request(app)
        .get('/api/perceptions/evolution/person-uuid-1')
        .expect(200);

      expect(response.body).toEqual({ perceptions: mockEvolution });
    });
  });

  describe('GET /api/perceptions/lens', () => {
    it('should return lens view', async () => {
      vi.mocked(perceptionService.getPerceptionLens).mockResolvedValue([]);
      await request(app)
        .get('/api/perceptions/lens?timeStart=2024-01-01&subject_alias=Alice')
        .expect(200);
      expect(perceptionService.getPerceptionLens).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ timeStart: '2024-01-01', subject_alias: 'Alice' })
      );
    });
  });

  describe('GET /api/perceptions/review-needed', () => {
    it('should return entries needing review', async () => {
      const entries = [{ id: 'e1', subject_alias: 'X' }];
      vi.mocked(perceptionService.getEntriesNeedingReview).mockResolvedValue(entries as any);

      const response = await request(app)
        .get('/api/perceptions/review-needed')
        .expect(200);

      expect(response.body).toEqual({ entries });
    });
  });

  describe('POST /api/perceptions', () => {
    it('should create a perception with valid framing', async () => {
      const created = { id: 'p1', subject_alias: 'Alex', content: 'I believed he was honest', impact_on_me: 'Trust' };
      vi.mocked(perceptionService.createPerceptionEntry).mockResolvedValue(created as any);

      const response = await request(app)
        .post('/api/perceptions')
        .send({
          subject_alias: 'Alex',
          content: 'I believed he was honest.',
          source: 'overheard',
          impact_on_me: 'Trust in our friendship',
        })
        .expect(201);

      expect(response.body).toHaveProperty('perception', created);
    });

    it('should return 400 when content lacks perception framing', async () => {
      await request(app)
        .post('/api/perceptions')
        .send({
          subject_alias: 'Alex',
          content: 'He was always honest and kind to everyone.',
          source: 'overheard',
          impact_on_me: 'Trust',
        })
        .expect(400);
    });
  });

  describe('PATCH /api/perceptions/:id', () => {
    it('should update a perception', async () => {
      const updated = { id: 'p1', status: 'confirmed' };
      vi.mocked(perceptionService.updatePerceptionEntry).mockResolvedValue(updated as any);

      const response = await request(app)
        .patch('/api/perceptions/p1')
        .send({ status: 'confirmed', impact_on_me: 'Updated impact' })
        .expect(200);

      expect(response.body.perception).toEqual(updated);
      expect(perceptionService.updatePerceptionEntry).toHaveBeenCalledWith(mockUser.id, 'p1', expect.any(Object));
    });
  });

  describe('DELETE /api/perceptions/:id', () => {
    it('should delete a perception', async () => {
      vi.mocked(perceptionService.deletePerceptionEntry).mockResolvedValue(undefined as any);

      await request(app)
        .delete('/api/perceptions/p1')
        .expect(204);

      expect(perceptionService.deletePerceptionEntry).toHaveBeenCalledWith(mockUser.id, 'p1');
    });
  });

  describe('POST /api/perceptions/extract-from-chat', () => {
    it('should extract and create perceptions from chat', async () => {
      const extraction = { perceptions: [], charactersCreated: [], charactersLinked: [], needsFraming: [] };
      vi.mocked(perceptionChatService.extractPerceptionsFromChat).mockResolvedValue(extraction as any);
      vi.mocked(perceptionChatService.createPerceptionsFromExtraction).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/perceptions/extract-from-chat')
        .send({ message: 'I heard from Sarah that Jake is leaving.' })
        .expect(200);

      expect(response.body).toHaveProperty('extraction');
      expect(response.body).toHaveProperty('created');
      expect(response.body).toHaveProperty('summary');
    });

    it('should return 400 when message is missing', async () => {
      await request(app)
        .post('/api/perceptions/extract-from-chat')
        .send({})
        .expect(400);
    });
  });
});

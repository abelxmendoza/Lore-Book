import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { correctionsRouter } from '../../src/routes/corrections';
import { requireAuth } from '../../src/middleware/auth';
import { correctionService } from '../../src/services/correctionService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/correctionService');

const app = express();
app.use(express.json());
app.use('/api/corrections', correctionsRouter);

describe('Corrections API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/corrections/apply-preview', () => {
    it('applies preview corrections and returns audit metadata', async () => {
      const response = await request(app)
        .post('/api/corrections/apply-preview')
        .send({
          messageId: 'msg-1',
          threadId: 'thread-1',
          text: "Denny's in Hollywood",
          corrections: [
            {
              id: '0:20:ORG',
              text: "Denny's in Hollywood",
              start: 0,
              end: 20,
              originalType: 'ORGANIZATION',
              correctedType: 'DEPLOYMENT_SITE',
              entityStatus: 'new',
              correctionAction: 'mark_worksite',
              correctionSource: 'composer',
            },
          ],
        })
        .expect(200);

      expect(response.body).toHaveProperty('auditId');
      expect(response.body.correctedSpans).toHaveLength(1);
      expect(response.body.correctedSpans[0].correctedType).toBe('DEPLOYMENT_SITE');
    });

    it('returns 400 for invalid body', async () => {
      await request(app)
        .post('/api/corrections/apply-preview')
        .send({ messageId: '', corrections: [] })
        .expect(400);
    });
  });

  describe('GET /api/corrections/:entryId', () => {
    it('should return entry with corrections', async () => {
      const entry = { id: 'e1', content: 'x', corrections: [] };
      vi.mocked(correctionService.getEntryWithCorrections).mockResolvedValue(entry as any);

      const response = await request(app).get('/api/corrections/e1').expect(200);
      expect(response.body).toMatchObject({ entry });
    });

    it('should return 404 when entry not found', async () => {
      vi.mocked(correctionService.getEntryWithCorrections).mockResolvedValue(null);
      await request(app).get('/api/corrections/unknown').expect(404);
    });
  });

  describe('POST /api/corrections/:entryId', () => {
    it('should add correction', async () => {
      const correction = { id: 'c1', correctedContent: 'fixed' };
      const entry = { id: 'e1', corrections: [correction] };
      vi.mocked(correctionService.addCorrection).mockResolvedValue(correction as any);
      vi.mocked(correctionService.getEntryWithCorrections).mockResolvedValue(entry as any);

      const response = await request(app)
        .post('/api/corrections/e1')
        .send({ correctedContent: 'fixed text' })
        .expect(201);
      expect(response.body).toHaveProperty('correction');
    });

    it('should return 400 for invalid body', async () => {
      await request(app).post('/api/corrections/e1').send({ correctedContent: 'ab' }).expect(400);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { journalRouter } from '../../src/routes/journal';
import { requireAuth } from '../../src/middleware/auth';
import { memoryService } from '../../src/services/memoryService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryService');

const app = express();
app.use(express.json());
app.use('/api/journal', journalRouter);

describe('Journal API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/journal/create', () => {
    it('should create entry', async () => {
      const entry = { id: 'e1', content: 'Today I did X' };
      vi.mocked(memoryService.saveEntry).mockResolvedValue(entry as any);

      const response = await request(app)
        .post('/api/journal/create')
        .send({ text: 'Today I did X' })
        .expect(201);
      expect(response.body).toHaveProperty('entry');
    });

    it('should return 400 for empty text', async () => {
      await request(app).post('/api/journal/create').send({ text: '' }).expect(400);
    });
  });

  describe('POST /api/journal/autosave', () => {
    it('should return ok', async () => {
      const response = await request(app)
        .post('/api/journal/autosave')
        .send({ text: 'draft' })
        .expect(200);
      expect(response.body).toMatchObject({ status: 'ok' });
    });
  });
});

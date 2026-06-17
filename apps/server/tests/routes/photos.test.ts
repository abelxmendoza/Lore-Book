import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { photosRouter } from '../../src/routes/photos';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    searchEntries: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/photos', photosRouter);

describe('Photos API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/photos', () => {
    it('should return photo entries', async () => {
      const { memoryService } = await import('../../src/services/memoryService');
      vi.mocked(memoryService.searchEntries).mockResolvedValue([]);

      const response = await request(app).get('/api/photos').expect(200);
      expect(response.body).toHaveProperty('entries');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.entries)).toBe(true);
      expect(memoryService.searchEntries).toHaveBeenCalledWith('user-123', { search: '', limit: 1000 });
    });

    it('returns 401 when unauthenticated', async () => {
      vi.mocked(requireAuth).mockImplementation((_req, res) => {
        res.status(401).json({ error: 'Unauthorized' });
      });
      await request(app).get('/api/photos').expect(401);
    });
  });

  describe('POST /api/photos/upload', () => {
    it('returns 400 when no file provided', async () => {
      await request(app).post('/api/photos/upload').expect(400);
    });
  });
});

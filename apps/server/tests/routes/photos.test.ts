import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { photosRouter } from '../../src/routes/photos';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    searchEntries: vi.fn(),
    getEntry: vi.fn(),
    updateEntry: vi.fn(),
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

  describe('PATCH /api/photos/:entryId/category', () => {
    it('merges the new category into existing metadata instead of replacing it', async () => {
      const { memoryService } = await import('../../src/services/memoryService');
      vi.mocked(memoryService.getEntry).mockResolvedValue({
        id: 'entry-1',
        tags: ['photo', 'memory', 'other'],
        metadata: { photoUrl: 'https://example.com/a.jpg', photoId: 'p1', category: 'other' },
      } as any);
      vi.mocked(memoryService.updateEntry).mockResolvedValue({ id: 'entry-1' } as any);

      await request(app)
        .patch('/api/photos/entry-1/category')
        .send({ category: 'meme' })
        .expect(200);

      expect(memoryService.updateEntry).toHaveBeenCalledWith(
        'user-123',
        'entry-1',
        expect.objectContaining({
          tags: expect.arrayContaining(['photo', 'memory', 'meme']),
          metadata: expect.objectContaining({
            photoUrl: 'https://example.com/a.jpg',
            photoId: 'p1',
            category: 'meme',
          }),
        }),
      );
      // The stale 'other' tag from before the correction must not linger.
      const call = vi.mocked(memoryService.updateEntry).mock.calls[0][2];
      expect(call.tags).not.toContain('other');
    });

    it('slugifies a custom category and stores the display label separately', async () => {
      const { memoryService } = await import('../../src/services/memoryService');
      vi.mocked(memoryService.getEntry).mockResolvedValue({
        id: 'entry-2',
        tags: ['photo'],
        metadata: { photoUrl: 'https://example.com/b.jpg' },
      } as any);
      vi.mocked(memoryService.updateEntry).mockResolvedValue({ id: 'entry-2' } as any);

      await request(app)
        .patch('/api/photos/entry-2/category')
        .send({ category: 'Cool Fits', customLabel: 'Cool Fits' })
        .expect(200);

      const call = vi.mocked(memoryService.updateEntry).mock.calls[0][2];
      expect(call.metadata).toMatchObject({ category: 'cool_fits', customCategoryLabel: 'Cool Fits' });
    });

    it('returns 404 when the photo entry does not exist', async () => {
      const { memoryService } = await import('../../src/services/memoryService');
      vi.mocked(memoryService.getEntry).mockResolvedValue(null);

      await request(app)
        .patch('/api/photos/missing/category')
        .send({ category: 'meme' })
        .expect(404);
    });

    it('returns 400 when category is missing from the body', async () => {
      await request(app).patch('/api/photos/entry-1/category').send({}).expect(400);
    });
  });
});

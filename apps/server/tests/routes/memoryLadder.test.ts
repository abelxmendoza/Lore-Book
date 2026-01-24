import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { memoryLadderRouter } from '../../src/routes/memoryLadder';
import { requireAuth } from '../../src/middleware/auth';
import { memoryLadderRenderer } from '../../src/services/memoryLadderRenderer';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryLadderRenderer');

const app = express();
app.use(express.json());
app.use('/api/memory-ladder', memoryLadderRouter);

describe('Memory Ladder API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/memory-ladder', () => {
    it('should return ladder', async () => {
      const ladder = { rungs: [] };
      vi.mocked(memoryLadderRenderer.render).mockResolvedValue(ladder as any);

      const response = await request(app).get('/api/memory-ladder').expect(200);
      expect(response.body).toEqual({ ladder });
    });

    it('should pass interval query', async () => {
      vi.mocked(memoryLadderRenderer.render).mockResolvedValue({} as any);
      await request(app).get('/api/memory-ladder?interval=monthly').expect(200);
      expect(memoryLadderRenderer.render).toHaveBeenCalledWith(mockUser.id, expect.objectContaining({ interval: 'monthly' }));
    });
  });
});

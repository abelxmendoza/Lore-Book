import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { memoryService } from '../../src/services/memoryService';
import { requireAuth } from '../../src/middleware/auth';
import { getTimeline } from '../../src/controllers/timelineController';
import { timelineRouter } from '../../src/routes/timeline';

// Mock dependencies
vi.mock('../../src/services/memoryService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/controllers/timelineController');
vi.mock('../../src/services/taskTimelineService');
vi.mock('../../src/services/timelinePageService');
vi.mock('../../src/services/autoTaggingService');
vi.mock('../../src/realtime/orchestratorEmitter', () => ({
  emitDelta: vi.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/timeline', timelineRouter);

describe('Timeline API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockTimeline = {
    chapters: [],
    unassigned: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
    vi.mocked(getTimeline).mockImplementation((req, res) => {
      res.json({ timeline: mockTimeline });
    });
  });

  describe('GET /api/timeline', () => {
    it('should return timeline data', async () => {
      const response = await request(app)
        .get('/api/timeline')
        .expect(200);

      expect(response.body).toHaveProperty('timeline');
      expect(getTimeline).toHaveBeenCalled();
    });
  });

  describe('GET /api/timeline/tags', () => {
    it('should return tags list', async () => {
      const mockTags = [
        { name: 'tag1', count: 5 },
        { name: 'tag2', count: 3 }
      ];
      vi.mocked(memoryService.listTags).mockResolvedValue(mockTags);

      const response = await request(app)
        .get('/api/timeline/tags')
        .expect(200);

      expect(response.body).toHaveProperty('tags');
      expect(Array.isArray(response.body.tags)).toBe(true);
      expect(memoryService.listTags).toHaveBeenCalledWith(mockUser.id);
    });
  });
});


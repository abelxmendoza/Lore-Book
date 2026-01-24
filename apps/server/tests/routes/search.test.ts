import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { searchRouter } from '../../src/routes/search';
import { requireAuth } from '../../src/middleware/auth';

const { mockSearch, mockEmptyResponse } = vi.hoisted(() => {
  const mockSearch = vi.fn();
  const mockEmptyResponse = vi.fn().mockReturnValue({
    life: [], people: [], locations: [], skills: [], projects: [],
    jobs: [], eras: [], arcs: [], sagas: [], relationships: [],
  });
  return { mockSearch, mockEmptyResponse };
});

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/timeline', () => ({ TimelineEngine: vi.fn() }));
vi.mock('../../src/services/timeline/universalSearchService', () => ({
  UniversalSearchService: vi.fn().mockImplementation(function () {
    return { search: mockSearch, emptyResponse: mockEmptyResponse };
  }),
}));

const app = express();
app.use(express.json());
app.use('/api/search', searchRouter);

describe('Search API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue({
      life: [], people: [], locations: [], skills: [], projects: [],
      jobs: [], eras: [], arcs: [], sagas: [], relationships: [],
    });
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/search/universal', () => {
    it('should return search results for valid query', async () => {
      mockSearch.mockResolvedValue({
        life: [{ id: '1', title: 'Test', date: '2024-01-01', timelineType: 'life' }],
        people: [], locations: [], skills: [], projects: [], jobs: [],
        eras: [], arcs: [], sagas: [], relationships: [],
      });

      const response = await request(app)
        .post('/api/search/universal')
        .send({ query: 'test search' })
        .expect(200);

      expect(response.body).toHaveProperty('life');
      expect(response.body.life).toHaveLength(1);
      expect(mockSearch).toHaveBeenCalledWith('user-123', 'test search');
    });

    it('should return 400 when query is missing', async () => {
      const response = await request(app)
        .post('/api/search/universal')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Query is required');
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('should return 400 when query is empty string', async () => {
      await request(app)
        .post('/api/search/universal')
        .send({ query: '' })
        .expect(400);
    });

    it('should handle search errors', async () => {
      mockSearch.mockRejectedValue(new Error('Search failed'));

      const response = await request(app)
        .post('/api/search/universal')
        .send({ query: 'test' })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});

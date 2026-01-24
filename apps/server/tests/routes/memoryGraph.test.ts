import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { memoryGraphRouter } from '../../src/routes/memoryGraph';
import { requireAuth } from '../../src/middleware/auth';
import { memoryGraphService } from '../../src/services/memoryGraphService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryGraphService');

const app = express();
app.use(express.json());
app.use('/api/memory-graph', memoryGraphRouter);

describe('Memory Graph API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/memory-graph', () => {
    it('should return graph', async () => {
      const graph = { nodes: [], edges: [] };
      vi.mocked(memoryGraphService.buildGraph).mockResolvedValue(graph as any);

      const response = await request(app).get('/api/memory-graph').expect(200);
      expect(response.body).toEqual({ graph });
    });
  });

  describe('POST /api/memory-graph/link', () => {
    it('should create link', async () => {
      const edge = { source: 'a', target: 'b', type: 'co_occurrence' };
      vi.mocked(memoryGraphService.buildGraph).mockResolvedValue({} as any);

      const response = await request(app)
        .post('/api/memory-graph/link')
        .send({ source: 'a', target: 'b' })
        .expect(201);
      expect(response.body).toHaveProperty('edge');
    });

    it('should return 400 for invalid body', async () => {
      await request(app).post('/api/memory-graph/link').send({}).expect(400);
    });
  });
});

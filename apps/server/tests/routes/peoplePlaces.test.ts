import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { peoplePlacesRouter } from '../../src/routes/peoplePlaces';
import { requireAuth } from '../../src/middleware/auth';
import { peoplePlacesService } from '../../src/services/peoplePlacesService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/peoplePlacesService');

const app = express();
app.use(express.json());
app.use('/api/people-places', peoplePlacesRouter);

describe('People Places API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/people-places', () => {
    it('should return entities', async () => {
      const entities = [{ id: 'e1', name: 'Alice', type: 'person' }];
      vi.mocked(peoplePlacesService.listEntities).mockResolvedValue(entities as any);

      const response = await request(app).get('/api/people-places').expect(200);
      expect(response.body).toEqual({ entities });
    });
  });

  describe('GET /api/people-places/stats', () => {
    it('should return stats', async () => {
      vi.mocked(peoplePlacesService.getStats).mockResolvedValue({ person: 5, place: 3 } as any);
      const response = await request(app).get('/api/people-places/stats').expect(200);
      expect(response.body).toHaveProperty('stats');
    });
  });

  describe('GET /api/people-places/:id', () => {
    it('should return entity', async () => {
      const entity = { id: 'e1', name: 'Alice' };
      vi.mocked(peoplePlacesService.getEntity).mockResolvedValue(entity as any);
      const response = await request(app).get('/api/people-places/e1').expect(200);
      expect(response.body).toEqual({ entity });
    });

    it('should return 404 when not found', async () => {
      vi.mocked(peoplePlacesService.getEntity).mockResolvedValue(null);
      await request(app).get('/api/people-places/unknown').expect(404);
    });
  });

  describe('POST /api/people-places/:id/aliases', () => {
    it('should add alias', async () => {
      const updated = { id: 'e1', aliases: ['A', 'B'] };
      vi.mocked(peoplePlacesService.addAlias).mockResolvedValue(updated as any);
      const response = await request(app).post('/api/people-places/e1/aliases').send({ alias: 'Bob' }).expect(201);
      expect(response.body).toHaveProperty('entity');
    });
  });
});

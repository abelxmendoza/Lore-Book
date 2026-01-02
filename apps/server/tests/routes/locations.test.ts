import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { locationService } from '../../src/services/locationService';
import { requireAuth } from '../../src/middleware/auth';
import { locationsRouter } from '../../src/routes/locations';

// Mock dependencies
vi.mock('../../src/services/locationService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/locations', locationsRouter);

describe('Locations API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockLocation = {
    id: 'loc-1',
    name: 'Test Location',
    user_id: 'user-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/locations', () => {
    it('should return locations list', async () => {
      vi.mocked(locationService.listLocations).mockResolvedValue([mockLocation]);

      const response = await request(app)
        .get('/api/locations')
        .expect(200);

      expect(response.body).toHaveProperty('locations');
      expect(Array.isArray(response.body.locations)).toBe(true);
    });
  });
});


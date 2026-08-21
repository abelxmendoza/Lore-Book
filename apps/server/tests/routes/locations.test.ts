import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { locationService } from '../../src/services/locationService';
import { requireAuth } from '../../src/middleware/auth';
import { locationsRouter } from '../../src/routes/locations';

// Mock dependencies
vi.mock('../../src/services/locationService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/conversationCentered/entityTimelineBuilder');
vi.mock('../../src/services/temporal/userTimezoneService', () => ({
  resolveUserTimezoneForRequest: vi.fn().mockResolvedValue('America/Los_Angeles'),
}));
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
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

  describe('GET /api/locations/:id/timelines', () => {
    it('returns the built timeline', async () => {
      const { locationTimelineBuilder } = await import(
        '../../src/services/conversationCentered/entityTimelineBuilder'
      );
      const timelines = { sharedExperiences: [], lore: [{ id: 'row-1' }] };
      vi.mocked(locationTimelineBuilder.buildTimelines).mockResolvedValue(timelines as any);

      const response = await request(app)
        .get('/api/locations/loc-1/timelines')
        .expect(200);

      expect(response.body).toEqual({ success: true, timelines });
      expect(locationTimelineBuilder.buildTimelines).toHaveBeenCalledWith(
        'user-123',
        'loc-1',
        'America/Los_Angeles',
      );
    });
  });

  describe('POST /api/locations/:id/rebuild-timelines', () => {
    it('returns deprecated compatibility no-op instead of rebuilding chronology', async () => {
      const { locationTimelineBuilder } = await import(
        '../../src/services/conversationCentered/entityTimelineBuilder'
      );
      vi.mocked(locationTimelineBuilder.rebuildTimelinesForEntity).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/locations/loc-1/rebuild-timelines')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        deprecated: true,
        rebuilt: false,
      });
      expect(response.body.message).toMatch(/deprecated/i);
      expect(locationTimelineBuilder.rebuildTimelinesForEntity).toHaveBeenCalledWith('user-123', 'loc-1');
    });
  });
});


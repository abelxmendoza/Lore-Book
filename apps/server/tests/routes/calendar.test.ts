import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { calendarRouter } from '../../src/routes/calendar';
import { requireAuth } from '../../src/middleware/auth';
import { calendarService } from '../../src/services/calendarService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/calendarService', () => ({
  calendarService: {
    syncEvents: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/calendar', calendarRouter);

describe('Calendar API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/calendar/sync', () => {
    it('should sync calendar events', async () => {
      vi.mocked(calendarService.syncEvents).mockResolvedValue({
        created: 2,
        updated: 0,
        skipped: 0,
      } as any);

      const response = await request(app)
        .post('/api/calendar/sync')
        .send({
          events: [
            { id: 'e1', title: 'Meet', startDate: '2024-01-15T10:00:00Z', endDate: '2024-01-15T11:00:00Z' },
          ],
        })
        .expect(201);
      expect(response.body.success).toBe(true);
      expect(calendarService.syncEvents).toHaveBeenCalledWith('user-123', expect.any(Array));
    });

    it('should return 400 when events schema invalid', async () => {
      await request(app)
        .post('/api/calendar/sync')
        .send({})
        .expect(400);
    });
  });
});

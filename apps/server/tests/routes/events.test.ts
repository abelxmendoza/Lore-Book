// =====================================================
// EVENTS ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies BEFORE importing the route
vi.mock('../../src/services/events/eventResolver');
vi.mock('../../src/services/events/storageService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

// Import route after mocks are set up
import eventsRouter from '../../src/routes/events';
import { resetInstances } from '../../src/routes/events';

const app = express();
app.use(express.json());
app.use('/api/events', eventsRouter);

describe('Events Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    resetInstances(); // Reset instances so mocks take effect
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/events/resolve', () => {
    it('should resolve events from journal entries', async () => {
      const { EventResolver } = await import('../../src/services/events/eventResolver');
      const mockResolver = {
        process: vi.fn().mockResolvedValue([
          { id: 'event-1', title: 'Workout', type: 'workout' },
          { id: 'event-2', title: 'Meeting', type: 'social' },
        ]),
      };

      // Mock the EventResolver constructor
      vi.mocked(EventResolver).mockImplementation(() => mockResolver as any);

      const response = await request(app)
        .post('/api/events/resolve')
        .send({
          entries: [
            { id: 'entry-1', content: 'I worked out today' },
            { id: 'entry-2', content: 'I met with John' },
          ],
        })
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body.events).toHaveLength(2);
    });

    it('should handle entries from context', async () => {
      const { EventResolver } = await import('../../src/services/events/eventResolver');
      const mockResolver = {
        process: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(EventResolver).mockImplementation(() => mockResolver as any);

      await request(app)
        .post('/api/events/resolve')
        .send({
          context: {
            entries: [{ id: 'entry-1', content: 'Test' }],
          },
        })
        .expect(200);

      expect(mockResolver.process).toHaveBeenCalled();
    });
  });

  describe('GET /api/events', () => {
    it('should get all events for user', async () => {
      const { EventStorage } = await import('../../src/services/events/storageService');
      const mockStorage = {
        loadAll: vi.fn().mockResolvedValue([
          { id: 'event-1', title: 'Event 1', start_time: '2024-01-01' },
          { id: 'event-2', title: 'Event 2', start_time: '2024-01-02' },
        ]),
      };

      vi.mocked(EventStorage).mockImplementation(() => mockStorage as any);

      const response = await request(app)
        .get('/api/events')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body.events).toHaveLength(2);
      expect(mockStorage.loadAll).toHaveBeenCalledWith('test-user-id');
    });

    it('should filter by date range', async () => {
      const { EventStorage } = await import('../../src/services/events/storageService');
      const mockStorage = {
        loadAll: vi.fn().mockResolvedValue([
          { id: 'event-1', title: 'Event 1', start_time: '2024-01-15' },
        ]),
      };

      vi.mocked(EventStorage).mockImplementation(() => mockStorage as any);

      const response = await request(app)
        .get('/api/events?start_date=2024-01-01&end_date=2024-01-31')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      // Events should be filtered by date range
      expect(response.body.events.every((e: any) => {
        const eventTime = new Date(e.start_time).getTime();
        return eventTime >= new Date('2024-01-01').getTime() &&
               eventTime <= new Date('2024-01-31').getTime();
      })).toBe(true);
    });
  });

  describe('GET /api/events/:id', () => {
    it('should get a specific event', async () => {
      const { EventStorage } = await import('../../src/services/events/storageService');
      const mockStorage = {
        loadAll: vi.fn().mockResolvedValue([
          { id: 'event-1', title: 'Event 1', start_time: '2024-01-01' },
          { id: 'event-2', title: 'Event 2', start_time: '2024-01-02' },
        ]),
      };

      vi.mocked(EventStorage).mockImplementation(() => mockStorage as any);

      const response = await request(app)
        .get('/api/events/event-1')
        .expect(200);

      expect(response.body).toHaveProperty('event');
      expect(response.body.event.id).toBe('event-1');
    });

    it('should return 404 if event not found', async () => {
      const { EventStorage } = await import('../../src/services/events/storageService');
      const mockStorage = {
        loadAll: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(EventStorage).mockImplementation(() => mockStorage as any);

      await request(app)
        .get('/api/events/non-existent')
        .expect(404);
    });
  });
});

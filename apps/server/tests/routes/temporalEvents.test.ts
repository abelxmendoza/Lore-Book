import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/temporalEvents/eventResolver', () => ({
  TemporalEventResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('../../src/services/temporalEvents/storageService', () => ({
  EventStorage: vi.fn().mockImplementation(function (this: unknown) {
    return { loadAll: vi.fn().mockResolvedValue([]) };
  }),
}));

import temporalEventsRouter from '../../src/routes/temporalEvents';

const app = express();
app.use(express.json());
app.use('/api/temporal-events', temporalEventsRouter);

describe('Temporal Events API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns events', async () => {
    const res = await request(app).post('/api/temporal-events/resolve').send({}).expect(200);
    expect(res.body).toHaveProperty('events');
  });

  it('GET / returns events', async () => {
    const res = await request(app).get('/api/temporal-events/').expect(200);
    expect(res.body).toHaveProperty('events');
  });
});

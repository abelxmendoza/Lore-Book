import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/services/toxicity', () => ({
  ToxicityResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ events: [] }) };
  }),
}));
vi.mock('../../src/services/toxicity/toxicityStorage', () => ({
  ToxicityStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getEvents: vi.fn().mockResolvedValue([]),
      getEventsByEntity: vi.fn().mockResolvedValue([]),
      getEvent: vi.fn().mockResolvedValue(null),
    };
  }),
}));

import toxicityRouter from '../../src/routes/toxicity';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = mockUser;
  next();
});
app.use('/api/toxicity', toxicityRouter);

describe('Toxicity API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns result', async () => {
    const res = await request(app)
      .post('/api/toxicity/resolve')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET / returns events', async () => {
    const res = await request(app).get('/api/toxicity').expect(200);
    expect(res.body).toHaveProperty('events');
  });

  it('GET /entity returns 400 without entityType or entityName', async () => {
    await request(app).get('/api/toxicity/entity').expect(400);
  });
});

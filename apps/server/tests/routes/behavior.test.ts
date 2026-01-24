import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/services/behavior/behaviorResolver', () => ({
  BehaviorResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ behaviors: [] }) };
  }),
}));
vi.mock('../../src/services/behavior/storageService', () => ({
  BehaviorStorage: vi.fn().mockImplementation(function (this: unknown) {
    return { getBehaviors: vi.fn().mockResolvedValue([]), getLoops: vi.fn().mockResolvedValue([]) };
  }),
}));

import behaviorRouter from '../../src/routes/behavior';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = mockUser;
  next();
});
app.use('/api/behavior', behaviorRouter);

describe('Behavior API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns result', async () => {
    const res = await request(app)
      .post('/api/behavior/resolve')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /resolve returns 400 without entries or user', async () => {
    await request(app).post('/api/behavior/resolve').send({}).expect(400);
  });

  it('GET /events returns events', async () => {
    const res = await request(app).get('/api/behavior/events').expect(200);
    expect(res.body).toHaveProperty('events');
  });

  it('GET /loops returns loops', async () => {
    const res = await request(app).get('/api/behavior/loops').expect(200);
    expect(res.body).toHaveProperty('loops');
  });
});

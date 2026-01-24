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
vi.mock('../../src/services/emotion/emotionResolver', () => ({
  EmotionResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('../../src/services/emotion/storageService', () => ({
  EmotionStorage: vi.fn().mockImplementation(function (this: unknown) {
    return { loadAll: vi.fn().mockResolvedValue([]) };
  }),
}));

import emotionResolutionRouter from '../../src/routes/emotionResolution';

const app = express();
app.use(express.json());
app.use('/api/emotion-resolution', emotionResolutionRouter);

describe('Emotion Resolution API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns emotions', async () => {
    const res = await request(app).post('/api/emotion-resolution/resolve').send({}).expect(200);
    expect(res.body).toHaveProperty('emotions');
  });

  it('GET /events returns events', async () => {
    const res = await request(app).get('/api/emotion-resolution/events').expect(200);
    expect(res.body).toHaveProperty('events');
  });
});

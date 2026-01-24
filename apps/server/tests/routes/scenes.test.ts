import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/services/scenes/sceneResolver', () => ({
  SceneResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ scenes: [] }) };
  }),
}));
vi.mock('../../src/services/scenes/storageService', () => ({
  SceneStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getScenes: vi.fn().mockResolvedValue([]),
      getScene: vi.fn().mockResolvedValue(null),
    };
  }),
}));

import scenesRouter from '../../src/routes/scenes';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = mockUser;
  next();
});
app.use('/api/scenes', scenesRouter);

describe('Scenes API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns result', async () => {
    const res = await request(app)
      .post('/api/scenes/resolve')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET / returns scenes', async () => {
    const res = await request(app).get('/api/scenes').expect(200);
    expect(res.body).toHaveProperty('scenes');
  });
});

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
vi.mock('../../src/services/engineManifest/manifestService', () => ({
  ManifestService: vi.fn().mockImplementation(function (this: unknown) {
    return {
      listEngines: vi.fn().mockResolvedValue([]),
      getBlueprint: vi.fn().mockResolvedValue({ name: 'test' }),
    };
  }),
}));
vi.mock('../../src/services/engineManifest/manifestSearch', () => ({
  ManifestSearch: vi.fn().mockImplementation(function (this: unknown) {
    return { search: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('../../src/services/engineManifest/manifestSync', () => ({
  ManifestSync: vi.fn().mockImplementation(function (this: unknown) {
    return { sync: vi.fn().mockResolvedValue(undefined) };
  }),
}));

import enginesRouter from '../../src/routes/engines';

const app = express();
app.use(express.json());
app.use('/api/engines', enginesRouter);

describe('Engines API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /list returns engines', async () => {
    const res = await request(app).get('/api/engines/list').expect(200);
    expect(res.body).toHaveProperty('engines');
  });

  it('GET /search returns 400 without q', async () => {
    await request(app).get('/api/engines/search').expect(400);
  });

  it('GET /search returns results with q', async () => {
    const res = await request(app).get('/api/engines/search').query({ q: 'memory' }).expect(200);
    expect(res.body).toHaveProperty('results');
  });
});

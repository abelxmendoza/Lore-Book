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
vi.mock('../../src/services/engineRegistry/registryLoader', () => ({
  RegistryLoader: { loadAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/engineRegistry/engineHealth', () => ({
  EngineHealth: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getHealth: vi.fn().mockResolvedValue({ name: 'e1', isHealthy: true }),
      getAllHealth: vi.fn().mockResolvedValue([]),
    };
  }),
}));
vi.mock('../../src/services/engineRegistry/engineRunner', () => ({
  EngineRunner: vi.fn().mockImplementation(function (this: unknown) {
    return { run: vi.fn().mockResolvedValue({ success: true }) };
  }),
}));

import engineRegistryRouter from '../../src/routes/engineRegistry';

const app = express();
app.use(express.json());
app.use('/api/engine-registry', engineRegistryRouter);

describe('Engine Registry API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /list returns engines', async () => {
    const res = await request(app).get('/api/engine-registry/list').expect(200);
    expect(res.body).toHaveProperty('engines');
  });

  it('GET /health returns health', async () => {
    const res = await request(app).get('/api/engine-registry/health').expect(200);
    expect(res.body).toHaveProperty('health');
  });
});

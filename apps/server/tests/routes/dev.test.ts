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
vi.mock('../../src/middleware/rbac', () => ({
  requireDevAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../src/config', () => ({ config: { apiEnv: 'dev' } }));
vi.mock('../../src/lib/dev/tailLogs', () => ({
  tailLogs: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/lib/dev/seedDatabase', () => ({
  seedDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/dev/clearDatabase', () => ({
  clearDatabase: vi.fn().mockResolvedValue(undefined),
}));

import { devRouter } from '../../src/routes/dev';

const app = express();
app.use(express.json());
app.use('/api/dev', devRouter);

describe('Dev API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /logs returns logs', async () => {
    const res = await request(app).get('/api/dev/logs').expect(200);
    expect(res.body).toHaveProperty('logs');
    expect(res.body).toHaveProperty('environment');
  });

  it('POST /preview-component returns preview', async () => {
    const res = await request(app)
      .post('/api/dev/preview-component')
      .send({ componentName: 'Test', props: {} })
      .expect(200);
    expect(res.body).toBeDefined();
  });
});

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
vi.mock('../../src/integrations/github/github.service', () => ({
  githubIntegrationService: {
    sync: vi.fn().mockResolvedValue({ ok: true }),
    getDistilled: vi.fn().mockResolvedValue([]),
    refresh: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { integrationsRouter } from '../../src/routes/integrations';

const app = express();
app.use(express.json());
app.use('/api/integrations', integrationsRouter);

describe('Integrations API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /github/sync returns result', async () => {
    const res = await request(app).get('/api/integrations/github/sync').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /github/events returns events', async () => {
    const res = await request(app).get('/api/integrations/github/events').expect(200);
    expect(res.body).toHaveProperty('events');
  });

  it('POST /github/refresh returns result', async () => {
    const res = await request(app).post('/api/integrations/github/refresh').expect(200);
    expect(res.body).toBeDefined();
  });
});

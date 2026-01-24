import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/identityCore', () => ({
  IdentityCoreEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('../../src/services/identityCore/identityStorage', () => ({
  IdentityStorage: vi.fn().mockImplementation(function (this: unknown) {
    return { getProfiles: vi.fn().mockResolvedValue([]), getSignals: vi.fn().mockResolvedValue([]) };
  }),
}));

import identityCoreRouter from '../../src/routes/identityCore';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/identity-core', identityCoreRouter);

describe('IdentityCore API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result with entries and user', async () => {
    const res = await request(app)
      .post('/api/identity-core/analyze')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /profiles returns profiles', async () => {
    const res = await request(app).get('/api/identity-core/profiles').expect(200);
    expect(res.body).toHaveProperty('profiles');
  });
});

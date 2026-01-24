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
vi.mock('../../src/services/locations/locationResolver', () => ({
  LocationResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('../../src/services/locations/storageService', () => ({
  LocationStorage: vi.fn().mockImplementation(function (this: unknown) {
    return { loadAll: vi.fn().mockResolvedValue([]) };
  }),
}));

import locationResolutionRouter from '../../src/routes/locationResolution';

const app = express();
app.use(express.json());
app.use('/api/location-resolution', locationResolutionRouter);

describe('Location Resolution API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns locations', async () => {
    const res = await request(app).post('/api/location-resolution/resolve').send({}).expect(200);
    expect(res.body).toHaveProperty('locations');
  });

  it('GET / returns locations', async () => {
    const res = await request(app).get('/api/location-resolution').expect(200);
    expect(res.body).toHaveProperty('locations');
  });
});

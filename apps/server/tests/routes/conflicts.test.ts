import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/services/conflict/conflictResolver', () => ({
  ConflictResolver: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ conflicts: [] }) };
  }),
}));
vi.mock('../../src/services/conflict/storageService', () => ({
  ConflictStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getConflicts: vi.fn().mockResolvedValue([]),
      getConflict: vi.fn().mockResolvedValue(null),
    };
  }),
}));

import conflictsRouter from '../../src/routes/conflicts';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = mockUser;
  next();
});
app.use('/api/conflicts', conflictsRouter);

describe('Conflicts API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /resolve returns result', async () => {
    const res = await request(app)
      .post('/api/conflicts/resolve')
      .send({ entries: [], user: { id: 'u1' } })
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET / returns conflicts', async () => {
    const res = await request(app).get('/api/conflicts').expect(200);
    expect(res.body).toHaveProperty('conflicts');
  });
});

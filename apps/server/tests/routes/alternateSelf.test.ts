import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/alternateSelf', () => ({
  AlternateSelfEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({ selves: [], clusters: [] }) };
  }),
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    searchEntries: vi.fn().mockResolvedValue([]),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import alternateSelfRouter from '../../src/routes/alternateSelf';

const app = express();
app.use(express.json());
app.use('/api/alternate-self', alternateSelfRouter);

describe('AlternateSelf API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze returns model', async () => {
    const res = await request(app).post('/api/alternate-self/analyze').expect(200);
    expect(res.body).toBeDefined();
  });
});

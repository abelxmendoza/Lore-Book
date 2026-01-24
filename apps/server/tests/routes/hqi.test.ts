import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/hqiService', () => ({
  hqiService: {
    search: vi.fn().mockReturnValue([]),
    context: vi.fn().mockReturnValue(null),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import { hqiRouter } from '../../src/routes/hqi';
import { hqiService } from '../../src/services/hqiService';

const app = express();
app.use(express.json());
app.use('/api/hqi', hqiRouter);

describe('HQI API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /search returns results', async () => {
    vi.mocked(hqiService.search).mockReturnValue([]);
    const res = await request(app).get('/api/hqi/search').query({ query: 'test' }).expect(200);
    expect(res.body).toHaveProperty('results');
  });

  it('POST /search returns results', async () => {
    vi.mocked(hqiService.search).mockReturnValue([]);
    const res = await request(app).post('/api/hqi/search').send({ query: 'test' }).expect(200);
    expect(res.body).toHaveProperty('results');
  });

  it('GET /node/:id/context returns 404 when not found', async () => {
    vi.mocked(hqiService.context).mockReturnValue(null);
    await request(app).get('/api/hqi/node/n1/context').expect(404);
  });

  it('GET /node/:id/context returns context when found', async () => {
    vi.mocked(hqiService.context).mockReturnValue({ id: 'n1' } as any);
    const res = await request(app).get('/api/hqi/node/n1/context').expect(200);
    expect(res.body).toHaveProperty('id', 'n1');
  });
});

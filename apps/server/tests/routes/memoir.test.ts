import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { memoirRouter } from '../../src/routes/memoir';
import { requireAuth } from '../../src/middleware/auth';
import { memoirService } from '../../src/services/memoirService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoirService');

const app = express();
app.use(express.json());
app.use('/api/memoir', memoirRouter);

describe('Memoir API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /outline should return outline', async () => {
    vi.mocked(memoirService.getOutline).mockResolvedValue({ chapters: [] } as any);
    const res = await request(app).get('/api/memoir/outline').expect(200);
    expect(res.body).toHaveProperty('_deprecated', true);
  });

  it('POST /auto-update should return success', async () => {
    vi.mocked(memoirService.autoUpdateMemoir).mockResolvedValue(undefined as any);
    const res = await request(app).post('/api/memoir/auto-update').send({}).expect(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /generate-section should return section', async () => {
    vi.mocked(memoirService.generateSection).mockResolvedValue({} as any);
    const res = await request(app).post('/api/memoir/generate-section').send({}).expect(200);
    expect(res.body).toBeDefined();
  });

  it('POST /generate-full should return memoir', async () => {
    vi.mocked(memoirService.generateFullMemoir).mockResolvedValue({} as any);
    const res = await request(app).post('/api/memoir/generate-full').send({}).expect(200);
    expect(res.body).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { perspectivesRouter } from '../../src/routes/perspectives';
import { requireAuth } from '../../src/middleware/auth';
import { perspectiveService } from '../../src/services/perspectiveService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/perspectiveService');

const app = express();
app.use(express.json());
app.use('/api/perspectives', perspectivesRouter);

describe('Perspectives API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / should return perspectives', async () => {
    vi.mocked(perspectiveService.getPerspectives).mockResolvedValue([]);
    const res = await request(app).get('/api/perspectives').expect(200);
    expect(res.body).toHaveProperty('perspectives');
  });

  it('POST / should create perspective', async () => {
    vi.mocked(perspectiveService.createPerspective).mockResolvedValue({ id: 'p1' } as any);
    const res = await request(app)
      .post('/api/perspectives')
      .send({ type: 'self', label: 'My view' })
      .expect(200);
    expect(res.body).toHaveProperty('perspective');
  });

  it('POST / should return 400 when type or label missing', async () => {
    await request(app).post('/api/perspectives').send({}).expect(400);
  });

  it('POST /defaults should return perspectives', async () => {
    vi.mocked(perspectiveService.getOrCreateDefaultPerspectives).mockResolvedValue([]);
    const res = await request(app).post('/api/perspectives/defaults').send({}).expect(200);
    expect(res.body).toHaveProperty('perspectives');
  });
});

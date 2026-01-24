import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/correctionDashboardService', () => ({
  correctionDashboardService: {
    getCorrectionDashboardData: vi.fn().mockResolvedValue({}),
    listCorrectionRecords: vi.fn().mockResolvedValue([]),
    listDeprecatedUnits: vi.fn().mockResolvedValue([]),
    listOpenContradictions: vi.fn().mockResolvedValue([]),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import correctionDashboardRouter from '../../src/routes/correctionDashboard';

const app = express();
app.use(express.json());
app.use('/api/correction-dashboard', correctionDashboardRouter);

describe('CorrectionDashboard API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /dashboard returns data', async () => {
    const res = await request(app).get('/api/correction-dashboard/dashboard').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });

  it('GET /records returns records', async () => {
    const res = await request(app).get('/api/correction-dashboard/records').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('records');
  });

  it('GET /deprecated returns units', async () => {
    const res = await request(app).get('/api/correction-dashboard/deprecated').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('GET /contradictions returns contradictions', async () => {
    const res = await request(app).get('/api/correction-dashboard/contradictions').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

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
vi.mock('../../src/services/engineGovernance', () => ({
  engineHealthMonitor: {
    getAllEngineHealth: vi.fn().mockReturnValue([]),
    getUnhealthyEngines: vi.fn().mockReturnValue([]),
    getStaleEngines: vi.fn().mockReturnValue([]),
    getRedundancyReport: vi.fn().mockReturnValue([]),
  },
  sensemakingOrchestrator: {
    decideEnginesToRun: vi.fn().mockResolvedValue({ engines: [] }),
    getVisibleEngines: vi.fn().mockReturnValue([]),
    getHiddenEngines: vi.fn().mockReturnValue([]),
  },
  ENGINE_DESCRIPTORS: [],
  getUIWorthyEngines: vi.fn().mockReturnValue([]),
  getHiddenEngines: vi.fn().mockReturnValue([]),
}));

import { engineHealthRouter } from '../../src/routes/engineHealth';

const app = express();
app.use(express.json());
app.use('/api/internal/engine', engineHealthRouter);

describe('Engine Health API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /health returns engine health', async () => {
    const res = await request(app).get('/api/internal/engine/health').expect(200);
    expect(res.body).toHaveProperty('engines');
    expect(res.body).toHaveProperty('summary');
  });

  it('GET /descriptors returns descriptors', async () => {
    const res = await request(app).get('/api/internal/engine/descriptors').expect(200);
    expect(res.body).toHaveProperty('engines');
  });

  it('POST /orchestrate returns decisions', async () => {
    const res = await request(app).post('/api/internal/engine/orchestrate').send({}).expect(200);
    expect(res.body).toHaveProperty('decisions');
    expect(res.body).toHaveProperty('visibleEngines');
    expect(res.body).toHaveProperty('hiddenEngines');
  });
});

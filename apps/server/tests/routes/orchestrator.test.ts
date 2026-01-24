import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { orchestratorRouter } from '../../src/routes/orchestrator';
import { requireAuth } from '../../src/middleware/auth';
import { orchestratorService } from '../../src/services/orchestratorService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/orchestratorService');

const app = express();
app.use(express.json());
app.use('/api/orchestrator', orchestratorRouter);

describe('Orchestrator API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /summary should return payload', async () => {
    vi.mocked(orchestratorService.getSummary).mockResolvedValue({} as any);
    const res = await request(app).get('/api/orchestrator/summary').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /timeline should return payload', async () => {
    vi.mocked(orchestratorService.getTimeline).mockResolvedValue({} as any);
    await request(app).get('/api/orchestrator/timeline').expect(200);
  });

  it('GET /identity should return payload', async () => {
    vi.mocked(orchestratorService.getIdentity).mockResolvedValue({} as any);
    await request(app).get('/api/orchestrator/identity').expect(200);
  });
});

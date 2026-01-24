import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { verificationRouter } from '../../src/routes/verification';
import { requireAuth } from '../../src/middleware/auth';
import { memoryService } from '../../src/services/memoryService';
import { truthVerificationService } from '../../src/services/truthVerificationService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/middleware/rateLimit', () => ({ rateLimitMiddleware: (_r: any, _q: any, n: () => void) => n() }));
vi.mock('../../src/middleware/validateRequest', () => ({ validateBody: () => (_r: any, _q: any, n: () => void) => n() }));
vi.mock('../../src/services/memoryService');
vi.mock('../../src/services/truthVerificationService');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/verification', verificationRouter);

describe('Verification API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /verify-entry/:id should return 404 when entry not found', async () => {
    vi.mocked(memoryService.getEntry).mockResolvedValue(null);
    await request(app).post('/api/verification/verify-entry/e1').expect(404);
  });

  it('POST /verify-claim should return results', async () => {
    vi.mocked(memoryService.searchEntries).mockResolvedValue([]);
    vi.mocked(truthVerificationService.verifyEntry).mockResolvedValue({} as any);
    const res = await request(app)
      .post('/api/verification/verify-claim')
      .send({ claim_type: 'date', subject: 'X', attribute: 'when', value: '2024' })
      .expect(200);
    expect(res.body).toHaveProperty('claim');
    expect(res.body).toHaveProperty('results');
  });
});

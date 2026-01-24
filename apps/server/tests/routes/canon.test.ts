import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { canonRouter } from '../../src/routes/canon';
import { requireAuth } from '../../src/middleware/auth';
import { canonicalService } from '../../src/services/canonicalService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/canonicalService', () => ({
  canonicalService: {
    buildAlignment: vi.fn(),
    summarizeCorrections: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/canon', canonRouter);

describe('Canon API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
    vi.mocked(canonicalService.buildAlignment).mockResolvedValue({
      records: [],
      chapters: {},
    } as any);
    vi.mocked(canonicalService.summarizeCorrections).mockReturnValue({
      totalCorrections: 0,
      lastUpdated: undefined,
    } as any);
  });

  describe('GET /api/canon', () => {
    it('should return alignment and stats', async () => {
      const response = await request(app).get('/api/canon').expect(200);
      expect(response.body).toHaveProperty('alignment');
      expect(response.body).toHaveProperty('stats');
      expect(response.body.alignment).toEqual({ records: [], chapters: {} });
      expect(canonicalService.buildAlignment).toHaveBeenCalledWith('user-123');
      expect(canonicalService.summarizeCorrections).toHaveBeenCalled();
    });
  });
});

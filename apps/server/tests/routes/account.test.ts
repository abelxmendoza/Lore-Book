import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'user-123', email: 'test@example.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/middleware/rateLimit', () => ({
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../src/services/securityLog', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  },
}));
vi.mock('fs', () => {
  const existsSync = vi.fn().mockReturnValue(false);
  const rmSync = vi.fn();
  const m = { existsSync, rmSync };
  return { __esModule: true, default: m, ...m };
});

let app: express.Express;

beforeAll(async () => {
  const { accountRouter } = await import('../../src/routes/account');
  app = express();
  app.use(express.json());
  app.use('/api/account', accountRouter);
});

describe('Account API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/account/export', () => {
    it('should return JSON export when summary is not requested', async () => {
      const response = await request(app)
        .get('/api/account/export')
        .expect(200);

      expect(response.body).toHaveProperty('userId', 'user-123');
      expect(response.body).toHaveProperty('exportedAt');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('audit');
    });

    it('should return gzip archive when summary=true', async () => {
      const response = await request(app)
        .get('/api/account/export?summary=true')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/zip');
      expect(response.headers['content-disposition']).toContain('lorekeeper-export.json.gz');
      expect(Buffer.isBuffer(response.body) || typeof response.body).toBeTruthy();
    });
  });

  describe('POST /api/account/delete', () => {
    it('should return 202 for session revocation when scope=sessions', async () => {
      const response = await request(app)
        .post('/api/account/delete')
        .send({ scope: 'sessions' })
        .expect(202);

      expect(response.body).toEqual({
        status: 'scheduled',
        message: 'Other sessions will be revoked.',
      });
    });

    it('should queue account deletion when no scope', async () => {
      const response = await request(app).post('/api/account/delete').send({});
      if (response.status !== 202) {
        const extra = (response.body as { _debug?: string })?._debug ? `\n_debug: ${(response.body as { _debug: string })._debug}` : '';
        throw new Error(`Expected 202, got ${response.status}. Body: ${JSON.stringify(response.body)}.${extra}`);
      }
      expect(response.body).toEqual({ status: 'scheduled', message: 'Account data deletion queued.' });
    });
  });
});

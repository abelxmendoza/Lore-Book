import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));
vi.mock('../../src/config', () => ({
  config: {
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceRoleKey: 'test-key',
  },
}));
vi.mock('../../src/services/securityLog', () => ({
  logSecurityEvent: vi.fn(),
  redactSensitive: vi.fn((v: string) => v),
}));

const origNodeEnv = process.env.NODE_ENV;
const origApiEnv = process.env.API_ENV;
const origDisableAuth = process.env.DISABLE_AUTH_FOR_DEV;

describe('auth middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let authMiddleware: (req: any, res: any, next: NextFunction) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.API_ENV = 'test';
    process.env.DISABLE_AUTH_FOR_DEV = '';
    mockRequest = {
      path: '/api/test',
      ip: '127.0.0.1',
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
    const m = await import('../../src/middleware/auth');
    authMiddleware = m.authMiddleware;
  });

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    process.env.API_ENV = origApiEnv;
    process.env.DISABLE_AUTH_FOR_DEV = origDisableAuth;
  });

  it('should call next when req.user is already set', async () => {
    (mockRequest as any).user = { id: 'u1', email: 'a@b.com' };
    await authMiddleware(mockRequest as any, mockResponse as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should return 401 when no Authorization header', async () => {
    await authMiddleware(mockRequest as any, mockResponse as Response, mockNext);
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect((mockResponse as any).json).toHaveBeenCalledWith({ error: 'Missing Authorization header' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid or no user', async () => {
    mockRequest.headers = { authorization: 'Bearer x' };
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Invalid' } });
    await authMiddleware(mockRequest as any, mockResponse as Response, mockNext);
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect((mockResponse as any).json).toHaveBeenCalledWith({ error: 'Invalid session' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should set req.user and call next when token is valid', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth');
    mockRequest.headers = { authorization: 'Bearer valid' };
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'u2', email: 'u@x.com', last_sign_in_at: '2020-01-01' } },
      error: null,
    });
    await authMiddleware(mockRequest as any, mockResponse as Response, mockNext);
    expect((mockRequest as any).user).toEqual({
      id: 'u2',
      email: 'u@x.com',
      lastSignInAt: '2020-01-01',
    });
    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should accept raw Bearer token in Authorization', async () => {
    mockRequest.headers = { authorization: 'Bearer tok' };
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'u3', email: null } },
      error: null,
    });
    await authMiddleware(mockRequest as any, mockResponse as Response, mockNext);
    expect(mockGetUser).toHaveBeenCalledWith('tok');
    expect((mockRequest as any).user?.id).toBe('u3');
    expect(mockNext).toHaveBeenCalled();
  });
});

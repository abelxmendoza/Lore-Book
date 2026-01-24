import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mockGetUserById = vi.fn();
vi.mock('../../src/config', () => ({
  config: {
    apiEnv: 'production',
    adminUserId: 'admin-uuid',
    enableExperimental: false,
  },
}));
vi.mock('../../src/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) } },
  },
}));

describe('rbac middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { path: '/api/admin', user: { id: 'user-1' } };
    mockResponse = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
  });

  describe('requireRole', () => {
    it('should return 401 when req.user is missing', async () => {
      const { requireRole } = await import('../../src/middleware/rbac');
      (mockRequest as any).user = undefined;
      await requireRole('admin')(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect((mockResponse as any).json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user role is not in allowed list', async () => {
      const { requireRole } = await import('../../src/middleware/rbac');
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'standard_user' } } },
        error: null,
      });
      await requireRole('admin', 'developer')(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next and set req.userRole when user has allowed role', async () => {
      const { requireRole } = await import('../../src/middleware/rbac');
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'admin' } } },
        error: null,
      });
      await requireRole('admin', 'developer')(mockRequest as any, mockResponse as Response, mockNext);
      expect((mockRequest as any).userRole).toBe('admin');
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow when config.adminUserId matches and apiEnv is dev', async () => {
      const { requireRole } = await import('../../src/middleware/rbac');
      const { config } = await import('../../src/config');
      const prev = (config as any).apiEnv;
      (config as any).apiEnv = 'dev';
      (mockRequest as any).user = { id: 'admin-uuid' };
      await requireRole('admin')(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      (config as any).apiEnv = prev;
    });
  });

  describe('requireAdmin', () => {
    it('should call next in dev/development apiEnv', async () => {
      const { requireAdmin } = await import('../../src/middleware/rbac');
      const { config } = await import('../../src/config');
      (config as any).apiEnv = 'development';
      await requireAdmin(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      (config as any).apiEnv = 'production';
    });

    it('should defer to requireRole in production', async () => {
      const { requireAdmin } = await import('../../src/middleware/rbac');
      const { config } = await import('../../src/config');
      (config as any).apiEnv = 'production';
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'admin' } } },
        error: null,
      });
      await requireAdmin(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireDevAccess', () => {
    it('should return 401 when req.user is missing', async () => {
      const { requireDevAccess } = await import('../../src/middleware/rbac');
      (mockRequest as any).user = undefined;
      await requireDevAccess(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when apiEnv is dev', async () => {
      const { requireDevAccess } = await import('../../src/middleware/rbac');
      const { config } = await import('../../src/config');
      const prev = (config as any).apiEnv;
      (config as any).apiEnv = 'dev';
      await requireDevAccess(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      (config as any).apiEnv = prev;
    });

    it('should call next when user is admin in production', async () => {
      const { requireDevAccess } = await import('../../src/middleware/rbac');
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'admin' } } },
        error: null,
      });
      requireDevAccess(mockRequest as any, mockResponse as Response, mockNext);
      await new Promise((r) => setImmediate(r));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when user is not admin/developer in production', async () => {
      const { requireDevAccess } = await import('../../src/middleware/rbac');
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'standard_user' } } },
        error: null,
      });
      requireDevAccess(mockRequest as any, mockResponse as Response, mockNext);
      await new Promise((r) => setImmediate(r));
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith({ error: 'Dev console access denied' });
    });
  });

  describe('requireExperimental', () => {
    it('should call next when config.enableExperimental is true', async () => {
      const { requireExperimental } = await import('../../src/middleware/rbac');
      const { config } = await import('../../src/config');
      (config as any).enableExperimental = true;
      await requireExperimental(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      (config as any).enableExperimental = false;
    });

    it('should return 403 when no user and experimental disabled', async () => {
      const { requireExperimental } = await import('../../src/middleware/rbac');
      (mockRequest as any).user = undefined;
      await requireExperimental(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith({ error: 'Experimental features disabled' });
    });

    it('should call next when user is admin and experimental disabled', async () => {
      const { requireExperimental } = await import('../../src/middleware/rbac');
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'admin' } } },
        error: null,
      });
      requireExperimental(mockRequest as any, mockResponse as Response, mockNext);
      await new Promise((r) => setImmediate(r));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when user is standard and experimental disabled', async () => {
      const { requireExperimental } = await import('../../src/middleware/rbac');
      mockGetUserById.mockResolvedValueOnce({
        data: { user: { id: 'user-1', user_metadata: { role: 'standard_user' } } },
        error: null,
      });
      requireExperimental(mockRequest as any, mockResponse as Response, mockNext);
      await new Promise((r) => setImmediate(r));
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });
});

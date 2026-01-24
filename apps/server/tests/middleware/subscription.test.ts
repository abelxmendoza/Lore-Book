import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mockGetUserSubscription = vi.fn();
const mockCanCreateEntry = vi.fn();
const mockCanMakeAiRequest = vi.fn();
const mockGetCurrentUsage = vi.fn();

vi.mock('../../src/services/stripeService', () => ({
  getUserSubscription: (...args: unknown[]) => mockGetUserSubscription(...args),
}));
vi.mock('../../src/services/usageTracking', () => ({
  getCurrentUsage: (...args: unknown[]) => mockGetCurrentUsage(...args),
  canCreateEntry: (...args: unknown[]) => mockCanCreateEntry(...args),
  canMakeAiRequest: (...args: unknown[]) => mockCanMakeAiRequest(...args),
}));

describe('subscription middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { user: { id: 'user-1' } };
    mockResponse = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    mockNext = vi.fn();
  });

  describe('checkSubscription', () => {
    it('should return 401 when req.user is missing', async () => {
      const { checkSubscription } = await import('../../src/middleware/subscription');
      (mockRequest as any).user = undefined;
      await checkSubscription(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next when no subscription (free tier)', async () => {
      const { checkSubscription } = await import('../../src/middleware/subscription');
      mockGetUserSubscription.mockResolvedValueOnce(null);
      await checkSubscription(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next when trial is active', async () => {
      const { checkSubscription } = await import('../../src/middleware/subscription');
      const future = new Date(Date.now() + 86400000);
      mockGetUserSubscription.mockResolvedValueOnce({
        status: 'active',
        planType: 'premium',
        trialEndsAt: future,
      });
      await checkSubscription(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next when premium active', async () => {
      const { checkSubscription } = await import('../../src/middleware/subscription');
      mockGetUserSubscription.mockResolvedValueOnce({
        status: 'active',
        planType: 'premium',
        trialEndsAt: null,
      });
      await checkSubscription(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when status is past_due or canceled', async () => {
      const { checkSubscription } = await import('../../src/middleware/subscription');
      mockGetUserSubscription.mockResolvedValueOnce({
        status: 'past_due',
        planType: 'premium',
        trialEndsAt: null,
      });
      await checkSubscription(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Subscription required', upgradeRequired: true })
      );
    });
  });

  describe('requirePremium', () => {
    it('should return 401 when req.user is missing', async () => {
      const { requirePremium } = await import('../../src/middleware/subscription');
      (mockRequest as any).user = undefined;
      await requirePremium(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should call next when in trial', async () => {
      const { requirePremium } = await import('../../src/middleware/subscription');
      mockGetUserSubscription.mockResolvedValueOnce({
        status: 'trialing',
        planType: 'free',
        trialEndsAt: new Date(Date.now() + 86400000),
      });
      await requirePremium(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next when premium active', async () => {
      const { requirePremium } = await import('../../src/middleware/subscription');
      mockGetUserSubscription.mockResolvedValueOnce({
        status: 'active',
        planType: 'premium',
        trialEndsAt: null,
      });
      await requirePremium(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when no premium', async () => {
      const { requirePremium } = await import('../../src/middleware/subscription');
      mockGetUserSubscription.mockResolvedValueOnce(null);
      await requirePremium(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Premium subscription required', upgradeRequired: true })
      );
    });
  });

  describe('checkEntryLimit', () => {
    it('should return 401 when req.user is missing', async () => {
      const { checkEntryLimit } = await import('../../src/middleware/subscription');
      (mockRequest as any).user = undefined;
      await checkEntryLimit(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should call next when allowed', async () => {
      const { checkEntryLimit } = await import('../../src/middleware/subscription');
      mockCanCreateEntry.mockResolvedValueOnce({ allowed: true });
      await checkEntryLimit(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when not allowed', async () => {
      const { checkEntryLimit } = await import('../../src/middleware/subscription');
      mockCanCreateEntry.mockResolvedValueOnce({ allowed: false, reason: 'Limit reached' });
      await checkEntryLimit(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Entry limit reached', message: 'Limit reached', upgradeRequired: true })
      );
    });
  });

  describe('checkAiRequestLimit', () => {
    it('should return 401 when req.user is missing', async () => {
      const { checkAiRequestLimit } = await import('../../src/middleware/subscription');
      (mockRequest as any).user = undefined;
      await checkAiRequestLimit(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should call next when allowed', async () => {
      const { checkAiRequestLimit } = await import('../../src/middleware/subscription');
      mockCanMakeAiRequest.mockResolvedValueOnce({ allowed: true });
      await checkAiRequestLimit(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when not allowed', async () => {
      const { checkAiRequestLimit } = await import('../../src/middleware/subscription');
      mockCanMakeAiRequest.mockResolvedValueOnce({ allowed: false, reason: 'AI limit reached' });
      await checkAiRequestLimit(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect((mockResponse as any).json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'AI request limit reached', message: 'AI limit reached', upgradeRequired: true })
      );
    });
  });

  describe('attachUsageData', () => {
    it('should call next when req.user is missing', async () => {
      const { attachUsageData } = await import('../../src/middleware/subscription');
      (mockRequest as any).user = undefined;
      await attachUsageData(mockRequest as any, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockGetCurrentUsage).not.toHaveBeenCalled();
    });

    it('should set req.usage and call next when user present', async () => {
      const { attachUsageData } = await import('../../src/middleware/subscription');
      const usage = { entryCount: 1, aiRequestsCount: 2, entryLimit: 50, aiLimit: 100, isPremium: false, isTrial: false };
      mockGetCurrentUsage.mockResolvedValueOnce(usage);
      await attachUsageData(mockRequest as any, mockResponse as Response, mockNext);
      expect((mockRequest as any).usage).toEqual(usage);
      expect(mockGetCurrentUsage).toHaveBeenCalledWith('user-1');
      expect(mockNext).toHaveBeenCalled();
    });
  });
});

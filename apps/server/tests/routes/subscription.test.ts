import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { subscriptionRouter } from '../../src/routes/subscription';
import * as stripeService from '../../src/services/stripeService';
import * as usageTracking from '../../src/services/usageTracking';

vi.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    (req as any).user = { id: 'u1', email: 'u@x.com' };
    next();
  },
  requireAuth: (req: any, _res: any, next: () => void) => {
    (req as any).user = { id: 'u1', email: 'u@x.com' };
    next();
  },
}));
vi.mock('../../src/services/stripeService', () => ({ getUserSubscription: vi.fn(), createCustomer: vi.fn(), createSubscription: vi.fn(), cancelSubscription: vi.fn(), reactivateSubscription: vi.fn(), createBillingPortalSession: vi.fn(), handleWebhook: vi.fn(), verifyWebhookSignature: vi.fn() }));
vi.mock('../../src/services/usageTracking', () => ({ getCurrentUsage: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/api/subscription', subscriptionRouter);

describe('Subscription API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/subscription/status', () => {
    it('should return free status when no subscription', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      vi.mocked(usageTracking.getCurrentUsage).mockResolvedValue({ entryCount: 0, aiRequestsCount: 0, entryLimit: 50, aiLimit: 100, isPremium: false, isTrial: false } as any);

      const response = await request(app).get('/api/subscription/status').expect(200);
      expect(response.body).toMatchObject({ status: 'free', planType: 'free' });
    });

    it('should return subscription when present', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue({
        id: 's1', userId: 'u1', stripeCustomerId: 'c1', stripeSubscriptionId: 'sub1',
        status: 'active', planType: 'premium', trialEndsAt: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false,
      } as any);
      vi.mocked(usageTracking.getCurrentUsage).mockResolvedValue({ entryCount: 1, aiRequestsCount: 2, entryLimit: Infinity, aiLimit: Infinity, isPremium: true, isTrial: false } as any);

      const response = await request(app).get('/api/subscription/status').expect(200);
      expect(response.body).toMatchObject({ status: 'active', planType: 'premium' });
    });
  });

  describe('GET /api/subscription/usage', () => {
    it('should return usage', async () => {
      const usage = { entryCount: 5, aiRequestsCount: 10, entryLimit: 50, aiLimit: 100, isPremium: false, isTrial: false };
      vi.mocked(usageTracking.getCurrentUsage).mockResolvedValue(usage as any);

      const response = await request(app).get('/api/subscription/usage').expect(200);
      expect(response.body).toEqual(usage);
    });
  });
});

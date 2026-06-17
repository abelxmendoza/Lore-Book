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
vi.mock('../../src/services/stripeService', () => ({
  getUserSubscription: vi.fn(),
  createCustomer: vi.fn(),
  createSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  createBillingPortalSession: vi.fn(),
  handleWebhook: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  ensureSubscriptionRow: vi.fn().mockResolvedValue(undefined),
  getSubscription: vi.fn(),
  extractCheckoutIntent: vi.fn((sub: {
    latest_invoice?: { payment_intent?: { client_secret?: string } | null };
    pending_setup_intent?: { client_secret?: string } | null;
  }) => {
    const pi = sub.latest_invoice?.payment_intent;
    const si = sub.pending_setup_intent;
    if (pi && typeof pi === 'object' && pi.client_secret) {
      return { clientSecret: pi.client_secret, intentType: 'payment' as const };
    }
    if (si?.client_secret) {
      return { clientSecret: si.client_secret, intentType: 'setup' as const };
    }
    return { clientSecret: null, intentType: null };
  }),
}));
vi.mock('../../src/services/usageTracking', () => ({ getCurrentUsage: vi.fn() }));
vi.mock('../../src/lib/accountAuthority', () => ({
  resolveAccountAuthority: vi.fn().mockResolvedValue({
    role: 'standard_user',
    roleLabel: 'Free',
    isFounderAccount: false,
    isPrivileged: false,
    privilegeSource: null,
    effectivePlanType: 'free',
    canBeBilled: true,
    canCancelSubscription: true,
    canLoseAccess: true,
  }),
  isBillingExempt: vi.fn().mockResolvedValue(false),
}));

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

  describe('POST /api/subscription/create', () => {
    it('returns the SetupIntent secret + intentType "setup" for a trial subscription', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      vi.mocked(stripeService.createCustomer).mockResolvedValue('cus_123');
      // Trialing subscription: no latest_invoice.payment_intent, has pending_setup_intent.
      vi.mocked(stripeService.createSubscription).mockResolvedValue({
        id: 'sub_1',
        status: 'trialing',
        trial_end: 1234567890,
        latest_invoice: { payment_intent: null },
        pending_setup_intent: { client_secret: 'seti_secret_abc' },
      } as any);

      const res = await request(app).post('/api/subscription/create').expect(200);
      expect(res.body).toMatchObject({
        subscriptionId: 'sub_1',
        clientSecret: 'seti_secret_abc',
        intentType: 'setup',
      });
    });

    it('returns the PaymentIntent secret + intentType "payment" for an immediate charge', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      vi.mocked(stripeService.createCustomer).mockResolvedValue('cus_123');
      vi.mocked(stripeService.createSubscription).mockResolvedValue({
        id: 'sub_2',
        status: 'active',
        trial_end: null,
        latest_invoice: { payment_intent: { client_secret: 'pi_secret_xyz' } },
        pending_setup_intent: null,
      } as any);

      const res = await request(app).post('/api/subscription/create').expect(200);
      expect(res.body).toMatchObject({
        subscriptionId: 'sub_2',
        clientSecret: 'pi_secret_xyz',
        intentType: 'payment',
      });
    });

    it('returns 503 billing_not_configured when Stripe is not set up', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      vi.mocked(stripeService.createCustomer).mockResolvedValue('cus_123');
      vi.mocked(stripeService.createSubscription).mockRejectedValue(
        new Error('Stripe or subscription price ID is not configured')
      );

      const res = await request(app).post('/api/subscription/create').expect(503);
      expect(res.body).toMatchObject({ error: 'billing_not_configured' });
    });

    it('rejects when the user already has a subscription', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue({
        stripeSubscriptionId: 'sub_existing',
        status: 'trial',
        planType: 'premium',
      } as any);

      const res = await request(app).post('/api/subscription/create').expect(400);
      expect(res.body).toMatchObject({ error: 'Subscription exists' });
    });
  });

  describe('POST /api/subscription/webhook', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const webhookApp = express();
      webhookApp.post(
        '/api/subscription/webhook',
        express.raw({ type: 'application/json' }),
        (await import('../../src/routes/subscription')).handleStripeWebhook
      );

      const res = await request(webhookApp)
        .post('/api/subscription/webhook')
        .set('Content-Type', 'application/json')
        .send('{}')
        .expect(400);

      expect(res.body).toMatchObject({ error: 'Missing stripe-signature header' });
    });
  });
});

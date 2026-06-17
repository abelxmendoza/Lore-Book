import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { AccountAuthority } from '../../src/lib/accountAuthority';
import { subscriptionRouter } from '../../src/routes/subscription';
import * as stripeService from '../../src/services/stripeService';
import * as usageTracking from '../../src/services/usageTracking';
import * as accountAuthority from '../../src/lib/accountAuthority';

function authorityFixture(overrides: Partial<AccountAuthority> & { role: AccountAuthority['role'] }): AccountAuthority {
  const privileged = ['owner', 'admin', 'developer'].includes(overrides.role);
  return {
    roleLabel: overrides.role === 'standard_user' ? 'User' : overrides.role,
    isFounderAccount: overrides.role === 'owner',
    isPrivileged: privileged,
    privilegeSource: privileged ? 'platform_authority' : null,
    effectivePlanType: privileged ? 'premium' : 'free',
    canBeBilled: !privileged,
    canCancelSubscription: !privileged,
    canLoseAccess: !privileged,
    ...overrides,
  };
}

const OWNER = authorityFixture({ role: 'owner' });
const ADMIN = authorityFixture({ role: 'admin', isFounderAccount: false, privilegeSource: 'administrative_privilege' });
const DEVELOPER = authorityFixture({ role: 'developer', isFounderAccount: false, privilegeSource: 'development_privilege' });
const USER = authorityFixture({ role: 'standard_user', isPrivileged: false, privilegeSource: null, effectivePlanType: 'free', canBeBilled: true, canCancelSubscription: true, canLoseAccess: true });

vi.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    if (!req.headers['x-test-role']) {
      return _res.status(401).json({ error: 'Missing Authorization header' });
    }
    (req as any).user = { id: 'test-user', email: 'test@example.com' };
    next();
  },
  requireAuth: (req: any, _res: any, next: () => void) => {
    (req as any).user = { id: 'test-user', email: 'test@example.com' };
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

vi.mock('../../src/services/usageTracking', () => ({
  getCurrentUsage: vi.fn().mockResolvedValue({
    entryCount: 0,
    aiRequestsCount: 0,
    entryLimit: 50,
    aiLimit: 100,
    isPremium: false,
    isTrial: false,
  }),
}));

vi.mock('../../src/lib/accountAuthority', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/accountAuthority')>();
  return {
    ...actual,
    resolveAccountAuthority: vi.fn(),
    isBillingExempt: vi.fn(),
  };
});

function buildApp(roleHeader?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (roleHeader) req.headers['x-test-role'] = roleHeader;
    next();
  });
  app.use('/api/subscription', subscriptionRouter);
  return app;
}

describe('Subscription API — role authority matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usageTracking.getCurrentUsage).mockResolvedValue({
      entryCount: 0,
      aiRequestsCount: 0,
      entryLimit: 50,
      aiLimit: 100,
      isPremium: false,
      isTrial: false,
    } as any);
  });

  describe('GUEST (no auth)', () => {
    it('GET /status returns 401', async () => {
      const app = buildApp();
      await request(app).get('/api/subscription/status').expect(401);
    });

    it('POST /create returns 401', async () => {
      const app = buildApp();
      await request(app).post('/api/subscription/create').expect(401);
    });
  });

  describe.each([
    ['OWNER', OWNER],
    ['ADMIN', ADMIN],
    ['DEVELOPER', DEVELOPER],
  ] as const)('%s privileged billing bypass', (_label, authority) => {
    beforeEach(() => {
      vi.mocked(accountAuthority.resolveAccountAuthority).mockResolvedValue(authority);
      vi.mocked(accountAuthority.isBillingExempt).mockResolvedValue(true);
    });

    it('GET /status returns privileged premium', async () => {
      const app = buildApp('auth');
      const res = await request(app).get('/api/subscription/status').expect(200);
      expect(res.body.planType).toBe('premium');
      expect(res.body.authority.isPrivileged).toBe(true);
      expect(res.body.usage.isPremium).toBe(true);
    });

    it('POST /create returns billing_not_required', async () => {
      const app = buildApp('auth');
      const res = await request(app).post('/api/subscription/create').expect(400);
      expect(res.body.error).toBe('billing_not_required');
    });

    it('POST /cancel returns billing_not_required', async () => {
      const app = buildApp('auth');
      const res = await request(app).post('/api/subscription/cancel').expect(400);
      expect(res.body.error).toBe('billing_not_required');
    });

    it('POST /reactivate returns billing_not_required', async () => {
      const app = buildApp('auth');
      const res = await request(app).post('/api/subscription/reactivate').expect(400);
      expect(res.body.error).toBe('billing_not_required');
    });

    it('GET /billing-portal returns billing_not_required', async () => {
      const app = buildApp('auth');
      const res = await request(app).get('/api/subscription/billing-portal').expect(400);
      expect(res.body.error).toBe('billing_not_required');
    });
  });

  describe('USER standard billing flow', () => {
    beforeEach(() => {
      vi.mocked(accountAuthority.resolveAccountAuthority).mockResolvedValue(USER);
      vi.mocked(accountAuthority.isBillingExempt).mockResolvedValue(false);
    });

    it('GET /status returns free when no subscription', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      const app = buildApp('auth');
      const res = await request(app).get('/api/subscription/status').expect(200);
      expect(res.body.status).toBe('free');
      expect(res.body.authority.isPrivileged).toBe(false);
    });

    it('POST /create proceeds to Stripe when no subscription', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      vi.mocked(stripeService.createCustomer).mockResolvedValue('cus_123');
      vi.mocked(stripeService.createSubscription).mockResolvedValue({
        id: 'sub_1',
        status: 'trialing',
        trial_end: 1234567890,
        latest_invoice: { payment_intent: null },
        pending_setup_intent: { client_secret: 'seti_secret' },
      } as any);

      const app = buildApp('auth');
      const res = await request(app).post('/api/subscription/create').expect(200);
      expect(res.body.subscriptionId).toBe('sub_1');
      expect(res.body.clientSecret).toBe('seti_secret');
    });

    it('POST /cancel requires an existing subscription', async () => {
      vi.mocked(stripeService.getUserSubscription).mockResolvedValue(null);
      const app = buildApp('auth');
      const res = await request(app).post('/api/subscription/cancel').expect(400);
      expect(res.body.error).toBe('No subscription found');
    });
  });
});

import { Router, type Request, type Response } from 'express';

import { config } from '../config';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import {
  resolveAccountAuthority,
  isBillingExempt,
  type AccountAuthority,
} from '../lib/accountAuthority';
import {
  createCustomer,
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  getUserSubscription,
  createBillingPortalSession,
  handleWebhook,
  verifyWebhookSignature,
  getSubscription,
  extractCheckoutIntent,
  ensureSubscriptionRow,
} from '../services/stripeService';
import { getCurrentUsage } from '../services/usageTracking';
import { getOpenAiBudgetSnapshot } from '../services/openaiBudgetService';

const router = Router();

function subscriptionAuthorityPayload(authority: AccountAuthority) {
  return {
    role: authority.role,
    roleLabel: authority.roleLabel,
    isFounderAccount: authority.isFounderAccount,
    isPrivileged: authority.isPrivileged,
    privilegeSource: authority.privilegeSource,
    subscriptionStatus: authority.isPrivileged ? 'privileged' : undefined,
  };
}

/**
 * GET /api/subscription/status
 * Get current subscription status and usage
 */
router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authority = await resolveAccountAuthority(req.user.id);
    const usage = await getCurrentUsage(req.user.id);
    const openAiBudget = await getOpenAiBudgetSnapshot();

    if (authority.isPrivileged) {
      return res.json({
        status: 'active',
        planType: 'premium',
        trialDaysRemaining: 0,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        usage: {
          ...usage,
          isPremium: true,
          isTrial: false,
          entryLimit: Infinity,
          aiLimit: Infinity,
        },
        openAiBudget,
        authority: subscriptionAuthorityPayload(authority),
      });
    }

    const subscription = await getUserSubscription(req.user.id);

    if (!subscription) {
      return res.json({
        status: 'free',
        planType: 'free',
        usage,
        openAiBudget,
        trialDaysRemaining: 0,
        authority: subscriptionAuthorityPayload(authority),
      });
    }

    const now = new Date();
    const trialDaysRemaining = subscription.trialEndsAt && subscription.trialEndsAt > now
      ? Math.ceil((subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return res.json({
      status: subscription.status,
      planType: subscription.planType,
      trialDaysRemaining,
      trialEndsAt: subscription.trialEndsAt?.toISOString() || null,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() || null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      usage,
      openAiBudget,
      authority: {
        ...subscriptionAuthorityPayload(authority),
        privilegeSource: authority.privilegeSource ?? 'stripe_subscription',
      },
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * GET /api/subscription/usage
 * Get current month usage
 */
router.get('/usage', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usage = await getCurrentUsage(req.user.id);
    return res.json(usage);
  } catch (error) {
    console.error('Error getting usage:', error);
    return res.status(500).json({ error: 'Failed to get usage' });
  }
});

/**
 * POST /api/subscription/create
 * Create subscription with 7-day free trial
 */
router.post('/create', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id || !req.user.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (await isBillingExempt(req.user.id)) {
      return res.status(400).json({
        error: 'billing_not_required',
        message: 'Your account has platform access — billing is not required.',
      });
    }

    // Check if user already has a subscription
    const existing = await getUserSubscription(req.user.id);
    await ensureSubscriptionRow(req.user.id);

    if (existing?.stripeSubscriptionId) {
      const paidStatuses = new Set(['trial', 'active']);
      if (paidStatuses.has(existing.status) && existing.planType === 'premium') {
        return res.status(400).json({
          error: 'Subscription exists',
          message: 'You already have an active subscription.',
        });
      }

      // Resume incomplete checkout (user abandoned PaymentElement)
      const stripeSub = await getSubscription(existing.stripeSubscriptionId);
      if (stripeSub && ['incomplete', 'trialing', 'past_due'].includes(stripeSub.status)) {
        const { clientSecret, intentType } = extractCheckoutIntent(stripeSub);
        if (clientSecret) {
          return res.json({
            subscriptionId: stripeSub.id,
            clientSecret,
            intentType,
            status: stripeSub.status,
            trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
          });
        }
      }
    }

    // Create or get Stripe customer
    let customerId = existing?.stripeCustomerId;
    if (!customerId) {
      customerId = await createCustomer(req.user.id, req.user.email);
    }

    // Create subscription with 7-day trial
    const subscription = await createSubscription(customerId, req.user.id, 7);

    // Return the client secret the PaymentElement should confirm. A trialing
    // subscription has no immediate PaymentIntent — Stripe attaches a
    // pending_setup_intent (collect card now, charge after trial). Prefer the
    // PaymentIntent (immediate charge) and fall back to the SetupIntent. The
    // `intentType` tells the client whether to call confirmPayment or confirmSetup.
    const { clientSecret, intentType } = extractCheckoutIntent(subscription);

    if (!clientSecret) {
      return res.status(502).json({
        error: 'checkout_unavailable',
        message: 'Could not start checkout — no payment intent from Stripe. Check SUBSCRIPTION_PRICE_ID and Stripe dashboard.',
      });
    }

    return res.json({
      subscriptionId: subscription.id,
      clientSecret,
      intentType,
      status: subscription.status,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    // Distinguish "Stripe isn't set up" from real failures so the UI can hide
    // the upgrade path instead of showing a generic error.
    if (typeof error?.message === 'string' && /not configured/i.test(error.message)) {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Subscription billing is not configured on this server.',
      });
    }
    return res.status(500).json({
      error: 'Failed to create subscription',
      message: error.message,
    });
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel subscription at period end
 */
router.post('/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (await isBillingExempt(req.user.id)) {
      return res.status(400).json({
        error: 'billing_not_required',
        message: 'Platform accounts cannot cancel privileged access via billing.',
      });
    }

    const subscription = await getUserSubscription(req.user.id);
    if (!subscription?.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'No subscription found',
        message: 'You do not have an active subscription to cancel.',
      });
    }

    await cancelSubscription(subscription.stripeSubscriptionId, req.user.id);

    return res.json({
      message: 'Subscription will be canceled at the end of the current billing period.',
      cancelAtPeriodEnd: true,
    });
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    return res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error.message,
    });
  }
});

/**
 * POST /api/subscription/reactivate
 * Reactivate a canceled subscription
 */
router.post('/reactivate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (await isBillingExempt(req.user.id)) {
      return res.status(400).json({
        error: 'billing_not_required',
        message: 'Platform accounts already have permanent access.',
      });
    }

    const subscription = await getUserSubscription(req.user.id);
    if (!subscription?.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'No subscription found',
        message: 'You do not have a subscription to reactivate.',
      });
    }

    await reactivateSubscription(subscription.stripeSubscriptionId, req.user.id);

    return res.json({
      message: 'Subscription has been reactivated.',
      cancelAtPeriodEnd: false,
    });
  } catch (error: any) {
    console.error('Error reactivating subscription:', error);
    return res.status(500).json({
      error: 'Failed to reactivate subscription',
      message: error.message,
    });
  }
});

/**
 * GET /api/subscription/billing-portal
 * Generate Stripe billing portal session URL
 */
router.get('/billing-portal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (await isBillingExempt(req.user.id)) {
      return res.status(400).json({
        error: 'billing_not_required',
        message: 'Billing portal is not available for platform accounts.',
      });
    }

    const subscription = await getUserSubscription(req.user.id);
    if (!subscription?.stripeCustomerId) {
      return res.status(400).json({
        error: 'No customer found',
        message: 'You do not have a Stripe customer account.',
      });
    }

    const returnUrl = req.query.return_url as string || `${req.protocol}://${req.get('host')}/subscription`;
    const portalUrl = await createBillingPortalSession(subscription.stripeCustomerId, returnUrl);

    return res.json({ url: portalUrl });
  } catch (error: any) {
    console.error('Error creating billing portal session:', error);
    return res.status(500).json({
      error: 'Failed to create billing portal session',
      message: error.message,
    });
  }
});

/**
 * POST /api/subscription/webhook
 * Mounted directly in index.ts (before auth + JSON body parser) with express.raw().
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  // req.body is Buffer when using express.raw()
  const body = req.body instanceof Buffer ? req.body : JSON.stringify(req.body);
  const event = verifyWebhookSignature(body, signature);

  if (!event) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    await handleWebhook(event);
    return res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

export { router as subscriptionRouter };


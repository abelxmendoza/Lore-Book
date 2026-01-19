import { Router } from 'express';
import type { Request, Response } from 'express';

import { config } from '../config';
import type { AuthenticatedRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import {
  createCustomer,
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  getUserSubscription,
  createBillingPortalSession,
  handleWebhook,
  verifyWebhookSignature,
} from '../services/stripeService';
import { getCurrentUsage } from '../services/usageTracking';

const router = Router();

/**
 * GET /api/subscription/status
 * Get current subscription status and usage
 */
router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subscription = await getUserSubscription(req.user.id);
    const usage = await getCurrentUsage(req.user.id);

    if (!subscription) {
      return res.json({
        status: 'free',
        planType: 'free',
        usage,
        trialDaysRemaining: 0,
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

    // Check if user already has a subscription
    const existing = await getUserSubscription(req.user.id);
    if (existing?.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'Subscription exists',
        message: 'You already have an active subscription.',
      });
    }

    // Create or get Stripe customer
    let customerId = existing?.stripeCustomerId;
    if (!customerId) {
      customerId = await createCustomer(req.user.id, req.user.email);
    }

    // Create subscription with 7-day trial
    const subscription = await createSubscription(customerId, req.user.id, 7);

    // Return client secret for payment confirmation
    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent;

    return res.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret,
      status: subscription.status,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error creating subscription:', error);
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
 * Stripe webhook endpoint (no auth required - uses signature verification)
 * Note: This route is registered separately in index.ts with raw body parser
 */
router.post('/webhook', async (req: Request, res: Response) => {
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
});

export { router as subscriptionRouter };


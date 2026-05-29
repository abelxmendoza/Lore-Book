// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Router } from 'express';

import { requireAuth } from '../middleware/auth';

import { pricingTable } from './pricing';
import { ensureStripe } from './stripeClient';

export const billingRouter = Router();

billingRouter.get('/pricing', (_req, res) => {
  res.json(pricingTable);
});

billingRouter.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const stripe = ensureStripe();
    const { tier } = req.body as { tier: keyof typeof pricingTable };
    const price = pricingTable[tier];
    if (!price) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user?.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: price.name, description: price.features.join(', ') },
            unit_amount: price.price * 100
          },
          quantity: 1
        }
      ],
      success_url: `${req.headers.origin ?? 'http://localhost:5173'}/billing/success`,
      cancel_url: `${req.headers.origin ?? 'http://localhost:5173'}/billing/cancel`
    });

    return res.json({ url: session.url });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create checkout session' });
  }
});

billingRouter.post('/portal', requireAuth, async (req, res) => {
  try {
    const stripe = ensureStripe();
    const { customerId } = req.body as { customerId: string };
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.origin ?? 'http://localhost:5173'}/settings`
    });
    return res.json({ url: portal.url });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to open billing portal' });
  }
});

billingRouter.post('/webhook', async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Billing] STRIPE_WEBHOOK_SECRET not set — webhook rejected');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event: import('stripe').Stripe.Event;
  try {
    const stripeClient = ensureStripe();
    // req.body must be the raw Buffer — ensure express.raw() is used for this route
    event = stripeClient.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    console.error('[Billing] Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Handle events — extend as needed
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      // TODO: sync subscription status to Supabase subscriptions table
      console.info('[Billing] Stripe event received:', event.type, event.id);
      break;
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
      console.info('[Billing] Invoice event:', event.type, event.id);
      break;
    default:
      console.info('[Billing] Unhandled Stripe event type:', event.type);
  }

  res.status(200).json({ received: true });
});

import Stripe from 'stripe';

import { config } from '../config';
import { stripeGuard } from '../lib/externalCircuitBreaker';
import { logger } from '../logger';

import { supabaseAdmin as supabase } from './supabaseClient';

// Initialize Stripe client
let stripe: Stripe | null = null;
if (config.stripeSecretKey) {
  stripe = new Stripe(config.stripeSecretKey, {
    apiVersion: '2024-12-18.acacia' as any,
  });
}

async function withStripe<T>(fn: () => Promise<T>): Promise<T> {
  return stripeGuard.run(fn);
}

export type SubscriptionStatus = 'trial' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired';
export type PlanType = 'free' | 'premium';

/**
 * Read the current billing period from a Stripe subscription.
 * In recent Stripe API versions (and the stripe@20 SDK types) `current_period_*`
 * moved from the subscription to the subscription item, so read from the item
 * first and fall back to the legacy top-level field. Returns ISO strings or null
 * (e.g. a trialing subscription may not have a period yet).
 */
function readSubscriptionPeriod(subscription: Stripe.Subscription): {
  startIso: string | null;
  endIso: string | null;
} {
  const item = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
    | undefined;
  const legacy = subscription as unknown as { current_period_start?: number; current_period_end?: number };
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;
  return {
    startIso: typeof start === 'number' ? new Date(start * 1000).toISOString() : null,
    endIso: typeof end === 'number' ? new Date(end * 1000).toISOString() : null,
  };
}

export interface SubscriptionData {
  id: string;
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  planType: PlanType;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export type CheckoutIntent = {
  clientSecret: string | null;
  intentType: 'payment' | 'setup' | null;
};

/** Ensure every user has a subscriptions row (trigger may have missed legacy accounts). */
export async function ensureSubscriptionRow(userId: string): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      { user_id: userId, status: 'active', plan_type: 'free' },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
  if (error) {
    logger.error({ error, userId }, 'ensureSubscriptionRow failed');
    throw new Error('Could not initialize subscription record');
  }
}

/** Extract PaymentElement client secret from a Stripe subscription. */
export function extractCheckoutIntent(subscription: Stripe.Subscription): CheckoutIntent {
  const invoice = subscription.latest_invoice as Stripe.Invoice & {
    payment_intent?: Stripe.PaymentIntent | string | null;
  };
  const paymentIntent =
    typeof invoice?.payment_intent === 'object' ? invoice.payment_intent : null;
  const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | string | null;
  const setupObj = typeof setupIntent === 'object' ? setupIntent : null;
  const clientSecret = paymentIntent?.client_secret ?? setupObj?.client_secret ?? null;
  const intentType: CheckoutIntent['intentType'] = paymentIntent?.client_secret
    ? 'payment'
    : setupObj?.client_secret
      ? 'setup'
      : null;
  return { clientSecret, intentType };
}

/**
 * Create a Stripe customer for a user
 */
export async function createCustomer(userId: string, email: string): Promise<string> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  await ensureSubscriptionRow(userId);

  const customer = await withStripe(() =>
    stripe!.customers.create({
      email,
      metadata: {
        userId,
      },
    })
  );

  const { error } = await supabase
    .from('subscriptions')
    .update({ stripe_customer_id: customer.id })
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, userId }, 'Failed to save stripe_customer_id');
    throw new Error('Could not save billing customer');
  }

  return customer.id;
}

/**
 * Create a subscription with 7-day free trial
 */
export async function createSubscription(
  customerId: string,
  userId: string,
  trialDays: number = 7
): Promise<Stripe.Subscription> {
  if (!stripe || !config.subscriptionPriceId) {
    throw new Error('Stripe or subscription price ID is not configured');
  }

  await ensureSubscriptionRow(userId);

  const trialEnd = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60);

  const subscription = await withStripe(() =>
    stripe!.subscriptions.create({
      customer: customerId,
      items: [{ price: config.subscriptionPriceId! }],
      trial_end: trialEnd,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    })
  );

  // Update subscription record
  await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      status: 'trial',
      plan_type: 'premium',
      trial_ends_at: new Date(trialEnd * 1000).toISOString(),
      current_period_start: readSubscriptionPeriod(subscription).startIso,
      current_period_end: readSubscriptionPeriod(subscription).endIso,
      cancel_at_period_end: false,
    })
    .eq('user_id', userId);

  return subscription;
}

/**
 * Cancel a subscription (at period end)
 */
export async function cancelSubscription(subscriptionId: string, userId: string): Promise<void> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  await withStripe(() =>
    stripe!.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
  );

  await supabase
    .from('subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('user_id', userId)
    .eq('stripe_subscription_id', subscriptionId);
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(subscriptionId: string, userId: string): Promise<void> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  await withStripe(() =>
    stripe!.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    })
  );

  await supabase
    .from('subscriptions')
    .update({ cancel_at_period_end: false })
    .eq('user_id', userId)
    .eq('stripe_subscription_id', subscriptionId);
}

/**
 * Get subscription details from Stripe
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  if (!stripe) {
    return null;
  }

  try {
    return await withStripe(() =>
      stripe!.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
      })
    );
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    return null;
  }
}

/**
 * Get user's subscription from database
 */
export async function getUserSubscription(userId: string): Promise<SubscriptionData | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    status: data.status,
    planType: data.plan_type,
    trialEndsAt: data.trial_ends_at ? new Date(data.trial_ends_at) : null,
    currentPeriodStart: data.current_period_start ? new Date(data.current_period_start) : null,
    currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

/**
 * Create billing portal session URL
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const session = await withStripe(() =>
    stripe!.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
  );

  return session.url;
}

/**
 * Log payment event to payment_events table
 */
async function logPaymentEvent(
  userId: string | null,
  stripeCustomerId: string | null,
  eventType: string,
  amount: number,
  currency: string,
  status: string,
  stripeInvoiceId?: string | null,
  stripePaymentIntentId?: string | null,
  metadata?: Record<string, any>
): Promise<void> {
  if (!userId) {
    logger.warn({ eventType, stripeCustomerId }, 'Cannot log payment event: no user_id');
    return;
  }

  try {
    const { error } = await supabase.from('payment_events').insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      stripe_invoice_id: stripeInvoiceId || null,
      stripe_payment_intent_id: stripePaymentIntentId || null,
      event_type: eventType,
      amount: amount / 100, // Convert from cents to dollars for storage
      currency: currency || 'usd',
      status: status,
      metadata: metadata || {},
    });

    if (error) {
      logger.error({ error, eventType, userId }, 'Failed to log payment event');
    }
  } catch (error) {
    logger.error({ error, eventType, userId }, 'Error logging payment event');
  }
}

/**
 * Get user_id from Stripe customer ID
 */
async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  return data?.user_id || null;
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhook(event: Stripe.Event): Promise<void> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  switch (event.type) {
    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscriptionFromStripe(subscription);
      
      // Log subscription creation event
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;
      const userId = await getUserIdFromCustomer(customerId);
      if (userId) {
        const amount = subscription.items.data[0]?.price?.unit_amount || 0;
        await logPaymentEvent(
          userId,
          customerId,
          'subscription_created',
          amount,
          subscription.currency || 'usd',
          subscription.status,
          undefined,
          undefined,
          { subscription_id: subscription.id }
        );
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscriptionFromStripe(subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(subscription);
      
      // Log subscription deletion event
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;
      const userId = await getUserIdFromCustomer(customerId);
      if (userId) {
        await logPaymentEvent(
          userId,
          customerId,
          'subscription_deleted',
          0,
          subscription.currency || 'usd',
          'canceled',
          undefined,
          undefined,
          { subscription_id: subscription.id }
        );
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const sub = await getSubscription(invoice.subscription as string);
        if (sub) {
          await syncSubscriptionFromStripe(sub);
        }
      }
      
      // Log successful payment
      const customerId = typeof invoice.customer === 'string' 
        ? invoice.customer 
        : invoice.customer?.id;
      const userId = customerId ? await getUserIdFromCustomer(customerId) : null;
      if (userId) {
        await logPaymentEvent(
          userId,
          customerId || null,
          'payment_succeeded',
          invoice.amount_paid || 0,
          invoice.currency || 'usd',
          'succeeded',
          invoice.id,
          typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
          { invoice_id: invoice.id, subscription_id: invoice.subscription }
        );
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const { data } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', invoice.subscription)
          .single();

        if (data) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('user_id', data.user_id);
        }
      }
      
      // Log failed payment
      const customerId = typeof invoice.customer === 'string' 
        ? invoice.customer 
        : invoice.customer?.id;
      const userId = customerId ? await getUserIdFromCustomer(customerId) : null;
      if (userId) {
        await logPaymentEvent(
          userId,
          customerId || null,
          'payment_failed',
          invoice.amount_due || 0,
          invoice.currency || 'usd',
          'failed',
          invoice.id,
          typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
          { invoice_id: invoice.id, subscription_id: invoice.subscription, attempt_count: invoice.attempt_count }
        );
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const customerId = typeof charge.customer === 'string' 
        ? charge.customer 
        : charge.customer?.id;
      const userId = customerId ? await getUserIdFromCustomer(customerId) : null;
      if (userId) {
        await logPaymentEvent(
          userId,
          customerId || null,
          'refund',
          charge.amount_refunded || 0,
          charge.currency || 'usd',
          'refunded',
          charge.invoice as string | undefined,
          charge.payment_intent as string | undefined,
          { charge_id: charge.id, refund_amount: charge.amount_refunded }
        );
      }
      break;
    }

    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
}

/**
 * Sync subscription data from Stripe to database
 */
async function syncSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === 'string' 
    ? subscription.customer 
    : subscription.customer.id;

  const { data: subData } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!subData) {
    console.error('Subscription not found for customer:', customerId);
    return;
  }

  const statusMap: Record<string, SubscriptionStatus> = {
    'trialing': 'trial',
    'active': 'active',
    'canceled': 'canceled',
    'past_due': 'past_due',
    'incomplete': 'incomplete',
    'incomplete_expired': 'incomplete_expired',
  };

  await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      status: statusMap[subscription.status] || 'active',
      plan_type: subscription.status === 'active' || subscription.status === 'trialing' ? 'premium' : 'free',
      current_period_start: readSubscriptionPeriod(subscription).startIso,
      current_period_end: readSubscriptionPeriod(subscription).endIso,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_ends_at: subscription.trial_end 
        ? new Date(subscription.trial_end * 1000).toISOString() 
        : null,
    })
    .eq('user_id', subData.user_id);
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === 'string' 
    ? subscription.customer 
    : subscription.customer.id;

  const { data: subData } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (subData) {
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        plan_type: 'free',
        stripe_subscription_id: null,
        cancel_at_period_end: false,
      })
      .eq('user_id', subData.user_id);
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  if (!stripe || !config.stripeWebhookSecret) {
    console.warn('Stripe webhook verification skipped: Stripe not configured');
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripeWebhookSecret
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return null;
  }
}

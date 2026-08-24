import { describe, expect, it } from 'vitest';
import type { Invoice } from 'stripe/cjs/resources/Invoices';
import type { Subscription } from 'stripe/cjs/resources/Subscriptions';

import {
  extractCheckoutIntent,
  readInvoicePaymentIntentId,
  readInvoiceSubscriptionId,
} from './stripeService';

describe('Stripe Dahlia compatibility', () => {
  it('reads subscription and PaymentIntent IDs from the Dahlia invoice shape', () => {
    const invoice = {
      parent: {
        type: 'subscription_details',
        quote_details: null,
        subscription_details: { metadata: null, subscription: { id: 'sub_123' } },
      },
      payments: {
        data: [{ payment: { type: 'payment_intent', payment_intent: { id: 'pi_123' } } }],
      },
    } as unknown as Invoice;

    expect(readInvoiceSubscriptionId(invoice)).toBe('sub_123');
    expect(readInvoicePaymentIntentId(invoice)).toBe('pi_123');
  });

  it('uses the Dahlia invoice confirmation secret for Payment Element checkout', () => {
    const subscription = {
      latest_invoice: {
        confirmation_secret: { client_secret: 'pi_secret_123', type: 'payment_intent' },
      },
      pending_setup_intent: null,
    } as unknown as Subscription;

    expect(extractCheckoutIntent(subscription)).toEqual({
      clientSecret: 'pi_secret_123',
      intentType: 'payment',
    });
  });
});

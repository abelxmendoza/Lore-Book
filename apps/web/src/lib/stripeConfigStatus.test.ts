import { describe, expect, it } from 'vitest';

import {
  detectStripeDashboardMode,
  evaluateStripeConfig,
  stripeDashboardUrl,
} from './stripeConfigStatus';

describe('evaluateStripeConfig', () => {
  it('reports fully configured when all keys are present', () => {
    const status = evaluateStripeConfig(
      {
        STRIPE_SECRET_KEY: true,
        STRIPE_WEBHOOK_SECRET: true,
        SUBSCRIPTION_PRICE_ID: true,
      },
      'pk_test_abc'
    );
    expect(status.fullyConfigured).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it('lists missing server and client keys', () => {
    const status = evaluateStripeConfig(
      { STRIPE_SECRET_KEY: true, STRIPE_WEBHOOK_SECRET: false, SUBSCRIPTION_PRICE_ID: false },
      ''
    );
    expect(status.fullyConfigured).toBe(false);
    expect(status.missing).toEqual([
      'STRIPE_WEBHOOK_SECRET (server)',
      'SUBSCRIPTION_PRICE_ID (server)',
      'VITE_STRIPE_PUBLISHABLE_KEY (web)',
    ]);
    expect(status.dashboardMode).toBe('test');
  });

  it('detects live dashboard mode from pk_live key', () => {
    expect(detectStripeDashboardMode('pk_live_abc')).toBe('live');
    expect(stripeDashboardUrl('/products', 'live')).toBe(
      'https://dashboard.stripe.com/products'
    );
  });
});

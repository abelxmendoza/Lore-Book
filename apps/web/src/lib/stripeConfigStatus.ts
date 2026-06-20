/**
 * Stripe billing readiness — server vars from /api/health plus client publishable key.
 */

export type StripeConfigCheck = {
  key: string;
  label: string;
  present: boolean;
  scope: 'server' | 'client';
};

export type StripeDashboardMode = 'test' | 'live';

export type StripeConfigStatus = {
  fullyConfigured: boolean;
  checks: StripeConfigCheck[];
  missing: string[];
  /** Derived from VITE_STRIPE_PUBLISHABLE_KEY prefix (defaults to test). */
  dashboardMode: StripeDashboardMode;
};

/** Test vs live from publishable key — pk_live_* → live dashboard. */
export function detectStripeDashboardMode(publishableKey: string | undefined): StripeDashboardMode {
  return publishableKey?.trim().startsWith('pk_live_') ? 'live' : 'test';
}

/** Canonical Stripe Dashboard URL for the active mode. */
export function stripeDashboardUrl(
  path = '',
  mode: StripeDashboardMode = 'test'
): string {
  const base = mode === 'live' ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const STRIPE_DASHBOARD = {
  home: (mode: StripeDashboardMode) => stripeDashboardUrl('', mode),
  products: (mode: StripeDashboardMode) => stripeDashboardUrl('/products', mode),
  webhooks: (mode: StripeDashboardMode) => stripeDashboardUrl('/webhooks', mode),
  apiKeys: (mode: StripeDashboardMode) => stripeDashboardUrl('/apikeys', mode),
  subscriptions: (mode: StripeDashboardMode) => stripeDashboardUrl('/subscriptions', mode),
  customers: (mode: StripeDashboardMode) => stripeDashboardUrl('/customers', mode),
} as const;

export function evaluateStripeConfig(
  envPresent: Record<string, boolean> | undefined,
  vitePublishableKey: string | undefined
): StripeConfigStatus {
  const checks: StripeConfigCheck[] = [
    {
      key: 'STRIPE_SECRET_KEY',
      label: 'STRIPE_SECRET_KEY (server)',
      present: !!envPresent?.STRIPE_SECRET_KEY,
      scope: 'server',
    },
    {
      key: 'STRIPE_WEBHOOK_SECRET',
      label: 'STRIPE_WEBHOOK_SECRET (server)',
      present: !!envPresent?.STRIPE_WEBHOOK_SECRET,
      scope: 'server',
    },
    {
      key: 'SUBSCRIPTION_PRICE_ID',
      label: 'SUBSCRIPTION_PRICE_ID (server)',
      present: !!envPresent?.SUBSCRIPTION_PRICE_ID,
      scope: 'server',
    },
    {
      key: 'VITE_STRIPE_PUBLISHABLE_KEY',
      label: 'VITE_STRIPE_PUBLISHABLE_KEY (web)',
      present: Boolean(vitePublishableKey?.trim()),
      scope: 'client',
    },
  ];

  const missing = checks.filter((c) => !c.present).map((c) => c.label);
  const dashboardMode = detectStripeDashboardMode(vitePublishableKey);

  return {
    fullyConfigured: missing.length === 0,
    checks,
    missing,
    dashboardMode,
  };
}

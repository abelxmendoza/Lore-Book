import { ExternalLink } from 'lucide-react';
import { STRIPE_DASHBOARD, type StripeConfigStatus } from '../../lib/stripeConfigStatus';

type Props = {
  stripeConfig: StripeConfigStatus;
  compact?: boolean;
};

export function StripeDashboardLinks({ stripeConfig, compact = false }: Props) {
  const mode = stripeConfig.dashboardMode;
  const modeLabel = mode === 'live' ? 'Live' : 'Test';

  const links = [
    { label: 'Dashboard home', href: STRIPE_DASHBOARD.home(mode) },
    { label: 'Products & prices', href: STRIPE_DASHBOARD.products(mode) },
    { label: 'Webhooks', href: STRIPE_DASHBOARD.webhooks(mode) },
    { label: 'API keys', href: STRIPE_DASHBOARD.apiKeys(mode) },
    { label: 'Subscriptions', href: STRIPE_DASHBOARD.subscriptions(mode) },
    { label: 'Customers', href: STRIPE_DASHBOARD.customers(mode) },
  ];

  if (compact) {
    return (
      <a
        href={STRIPE_DASHBOARD.home(mode)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 underline underline-offset-2"
      >
        Open Stripe {modeLabel} Dashboard
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
      <a
        href={STRIPE_DASHBOARD.home(mode)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-2 text-sm font-medium text-purple-100 hover:bg-purple-500/25 transition-colors"
      >
        Open Stripe {modeLabel} Dashboard
        <ExternalLink className="h-4 w-4" />
      </a>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {links.slice(1).map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-purple-300/90 hover:text-purple-200 underline underline-offset-2"
          >
            {link.label}
            <ExternalLink className="h-2.5 w-2.5 opacity-70" />
          </a>
        ))}
      </div>
    </div>
  );
}

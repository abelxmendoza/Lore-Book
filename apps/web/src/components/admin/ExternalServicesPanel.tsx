import { ExternalLink } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EXTERNAL_SERVICES, type ExternalService } from '../../lib/externalServiceLinks';
import { StripeDashboardLinks } from './StripeDashboardLinks';
import type { StripeConfigStatus } from '../../lib/stripeConfigStatus';

const ACCENT: Record<ExternalService['accent'], { border: string; bg: string; text: string; button: string }> = {
  emerald: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-200',
    button: 'border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100',
  },
  violet: {
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/10',
    text: 'text-violet-200',
    button: 'border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 text-violet-100',
  },
  sky: {
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    text: 'text-sky-200',
    button: 'border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100',
  },
  amber: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-200',
    button: 'border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100',
  },
  indigo: {
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-200',
    button: 'border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-100',
  },
  rose: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    text: 'text-rose-200',
    button: 'border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-100',
  },
  orange: {
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
    text: 'text-orange-200',
    button: 'border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 text-orange-100',
  },
  slate: {
    border: 'border-white/15',
    bg: 'bg-white/5',
    text: 'text-white/80',
    button: 'border-white/20 bg-white/10 hover:bg-white/15 text-white/90',
  },
};

type Props = {
  stripeConfig?: StripeConfigStatus | null;
};

function ServiceCard({ service, stripeConfig }: { service: ExternalService; stripeConfig?: StripeConfigStatus | null }) {
  const accent = ACCENT[service.accent];

  return (
    <article
      className={cn(
        'rounded-xl border p-4 flex flex-col bg-black/40',
        accent.border,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className={cn('text-base font-semibold', accent.text)}>{service.name}</h3>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">{service.summary}</p>
        </div>
      </div>

      <a
        href={service.primaryHref}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors w-fit',
          accent.button,
        )}
      >
        {service.manageLabel}
        <ExternalLink className="h-3.5 w-3.5 opacity-80" />
      </a>

      <ul className="mt-3 pt-3 border-t border-white/10 space-y-1.5 flex-1">
        {service.links.map((link) => (
          <li key={link.href + link.label}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-1.5 text-xs text-white/55 hover:text-white/90 transition-colors"
              title={link.hint}
            >
              <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-40 group-hover:opacity-80" />
              <span>
                <span className="underline underline-offset-2 decoration-white/20 group-hover:decoration-white/50">
                  {link.label}
                </span>
                {link.hint && (
                  <span className="block text-[10px] text-white/30 mt-0.5 leading-snug">{link.hint}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>

      {service.id === 'stripe' && stripeConfig && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">
            Quick open ({stripeConfig.dashboardMode === 'live' ? 'Live' : 'Test'} mode)
          </p>
          <StripeDashboardLinks stripeConfig={stripeConfig} />
        </div>
      )}
    </article>
  );
}

export function ExternalServicesPanel({ stripeConfig }: Props) {
  return (
    <div className="space-y-4">
      <div className={cn('rounded-lg border p-4', ACCENT.slate.border, ACCENT.slate.bg)}>
        <h2 className="text-lg font-semibold text-white">External service dashboards</h2>
        <p className="text-sm text-white/50 mt-1 max-w-3xl">
          Direct links to manage LoreBook infrastructure — database, hosting, billing, AI, auth, and monitoring.
          All links open in a new tab.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {EXTERNAL_SERVICES.map((service) => (
          <ServiceCard key={service.id} service={service} stripeConfig={stripeConfig} />
        ))}
      </div>
    </div>
  );
}

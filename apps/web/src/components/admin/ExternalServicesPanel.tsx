import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fetchJson } from '../../lib/api';
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

type XAdminSummary = {
  configured: boolean;
  total: number;
  error?: string;
  connections: Array<{
    id: string;
    user_id: string;
    provider_username: string | null;
    status: string | null;
    last_sync_at: string | null;
    updated_at: string | null;
  }>;
};

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  const [xSummary, setXSummary] = useState<XAdminSummary | null>(null);
  const [xLoading, setXLoading] = useState(false);

  const loadX = async () => {
    setXLoading(true);
    try {
      setXSummary(await fetchJson<XAdminSummary>('/api/admin/integrations/x'));
    } catch (error) {
      setXSummary({
        configured: false,
        total: 0,
        connections: [],
        error: error instanceof Error ? error.message : 'Failed to load X integration status',
      });
    } finally {
      setXLoading(false);
    }
  };

  useEffect(() => {
    void loadX();
  }, []);

  return (
    <div className="space-y-4">
      <div className={cn('rounded-lg border p-4', ACCENT.slate.border, ACCENT.slate.bg)}>
        <h2 className="text-lg font-semibold text-white">External service dashboards</h2>
        <p className="text-sm text-white/50 mt-1 max-w-3xl">
          Direct links to manage LoreBook infrastructure — database, hosting, billing, AI, auth, and monitoring.
          All links open in a new tab.
        </p>
      </div>

      <div className="rounded-xl border border-sky-500/25 bg-black/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-sky-200">X user connections</h3>
            <p className="mt-1 text-sm text-white/50">
              OAuth connection health for account-center X imports.
            </p>
          </div>
          <button
            type="button"
            onClick={loadX}
            disabled={xLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', xLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-white/35">OAuth Config</p>
            <p className={cn('mt-1 text-sm font-semibold', xSummary?.configured ? 'text-emerald-300' : 'text-amber-300')}>
              {xSummary?.configured ? 'Configured' : 'Missing'}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-white/35">Connections</p>
            <p className="mt-1 text-sm font-semibold text-white">{xSummary?.total ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-white/35">Last Sync</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatDate(xSummary?.connections?.[0]?.last_sync_at)}
            </p>
          </div>
        </div>

        {xSummary?.error && <p className="mt-3 text-sm text-amber-300">{xSummary.error}</p>}

        {xSummary?.connections?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/45">
                  <th className="py-2 pr-3 font-medium">Handle</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Last Sync</th>
                  <th className="py-2 pr-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {xSummary.connections.slice(0, 10).map((connection) => (
                  <tr key={connection.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white/80">@{connection.provider_username ?? 'unknown'}</td>
                    <td className="py-2 pr-3 text-white/60">{connection.status ?? 'unknown'}</td>
                    <td className="py-2 pr-3 text-white/50">{formatDate(connection.last_sync_at)}</td>
                    <td className="py-2 pr-3 text-white/50">{formatDate(connection.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/40">No users have connected X yet.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {EXTERNAL_SERVICES.map((service) => (
          <ServiceCard key={service.id} service={service} stripeConfig={stripeConfig} />
        ))}
      </div>
    </div>
  );
}

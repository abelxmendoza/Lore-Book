import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, ExternalLink, X } from 'lucide-react';

import { useMockData } from '../../contexts/MockDataContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useDatabaseOpsHealth } from '../../hooks/useDatabaseOpsHealth';
import { buildOpsBannerContent, opsSeverity } from '../../lib/dbHealth';

const DISMISS_KEY = 'lorebook_ops_banner_dismissed_at';

function readDismissedSeverity(): number {
  if (typeof window === 'undefined') return 0;
  const raw = sessionStorage.getItem(DISMISS_KEY);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Admin-only banner for Supabase ops: storage quota, upgrade blockers, SSL hints.
 * Dismissible per session; reappears if severity escalates.
 */
export function DatabaseOpsBanner() {
  const { backendUnavailable } = useMockData();
  const isMobile = useIsMobile();
  const { payload, showBanner, loading } = useDatabaseOpsHealth();
  const [dismissedSeverity, setDismissedSeverity] = useState(readDismissedSeverity);

  const content = useMemo(
    () => (payload ? buildOpsBannerContent(payload, { compact: isMobile }) : null),
    [payload, isMobile]
  );
  const severityRank = content ? opsSeverity(content.severity) : 0;

  useEffect(() => {
    if (!showBanner) {
      sessionStorage.removeItem(DISMISS_KEY);
      setDismissedSeverity(0);
    }
  }, [showBanner]);

  if (backendUnavailable || loading || !showBanner || !payload || !content?.headline) return null;
  if (dismissedSeverity >= severityRank) return null;

  const isCritical = content.severity === 'critical';

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, String(severityRank));
    setDismissedSeverity(severityRank);
  };

  const shellClass = isCritical
    ? 'bg-red-950/90 border-red-500/30 text-red-100/95'
    : 'bg-orange-950/90 border-orange-500/30 text-orange-100/95';

  const Icon = isCritical ? AlertTriangle : Database;

  return (
    <div
      className={`sticky top-0 z-[41] flex items-start gap-2 border-b px-3 py-2 ${shellClass} ${
        isMobile ? 'text-[11px]' : 'text-xs'
      }`}
      role="alert"
      aria-live="polite"
      data-testid="database-ops-banner"
      data-severity={content.severity}
    >
      <Icon className={`shrink-0 opacity-90 ${isMobile ? 'h-3 w-3 mt-0.5' : 'h-3.5 w-3.5 mt-0.5'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={isMobile ? 'leading-snug' : 'leading-relaxed'}>{content.headline}</p>
        {!isMobile && content.details.length > 0 ? (
          <ul className="mt-1 space-y-0.5 list-disc list-inside opacity-90">
            {content.details.slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {content.linkUrl && !isMobile ? (
          <a
            href={content.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1 underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            {content.linkLabel ?? 'Open Supabase dashboard'}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className={`shrink-0 rounded-md p-1 transition-colors ${
          isCritical
            ? 'text-red-200/60 hover:text-red-50 hover:bg-red-500/15'
            : 'text-orange-200/60 hover:text-orange-50 hover:bg-orange-500/15'
        }`}
        aria-label="Dismiss database ops warning"
      >
        <X className={isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </button>
    </div>
  );
}

/** @deprecated use DatabaseOpsBanner */
export const DatabaseStorageBanner = DatabaseOpsBanner;

import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useMockData } from '../contexts/MockDataContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { compactBackendStatusMessage } from '../lib/backendErrorDisplay';

const DISMISS_KEY = 'lorebook_backend_status_dismissed';

/**
 * Single global indicator when the backend is unreachable.
 * Compact on mobile; dismissible for the session.
 */
export function BackendUnavailableBanner() {
  const { backendUnavailable, useMockData: usingMock } = useMockData();
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  });

  useEffect(() => {
    if (backendUnavailable) return;
    setDismissed(false);
    sessionStorage.removeItem(DISMISS_KEY);
  }, [backendUnavailable]);

  if (!backendUnavailable || dismissed) return null;

  const label = compactBackendStatusMessage({ isMobile, usingMock });

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, '1');
  };

  if (isMobile) {
    return (
      <div
        className="sticky top-0 z-40 flex items-center gap-1.5 bg-amber-950/90 border-b border-amber-500/25 px-2.5 py-1 text-[11px] text-amber-200/90"
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 p-1 rounded-md text-amber-200/50 active:bg-amber-500/15"
          aria-label="Dismiss offline notice"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-950/85 border-b border-amber-500/20 px-3 py-1.5 text-xs text-amber-100/90"
      role="status"
      aria-live="polite"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      <span>{label}</span>
      <button
        type="button"
        onClick={dismiss}
        className="ml-1 p-1 rounded-md text-amber-200/50 hover:text-amber-100 hover:bg-amber-500/10 transition-colors"
        aria-label="Dismiss offline notice"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

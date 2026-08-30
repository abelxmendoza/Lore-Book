import { CirclePause, Sparkles, X } from 'lucide-react';
import { useState } from 'react';

export const DISCOVERY_DEVELOPMENT_NOTICE_DISMISSED_KEY =
  'lk_discovery_development_notice_dismissed_v1';

function wasDismissedThisSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISCOVERY_DEVELOPMENT_NOTICE_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function DiscoveryDevelopmentNotice() {
  const [dismissed, setDismissed] = useState(wasDismissedThisSession);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISCOVERY_DEVELOPMENT_NOTICE_DISMISSED_KEY, 'true');
    } catch {
      // The notice can still be dismissed when browser storage is unavailable.
    }
  };

  if (dismissed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discovery-development-notice-title"
      aria-describedby="discovery-development-notice-description"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-violet-400/25 bg-zinc-950 shadow-2xl shadow-violet-950/40">
        <div className="h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Discovery Hub development notice"
          className="absolute right-3 top-4 rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-7">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
            <CirclePause className="h-6 w-6" />
          </div>

          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            Discovery Hub preview
          </p>
          <h2 id="discovery-development-notice-title" className="pr-8 text-xl font-bold text-white sm:text-2xl">
            Development is currently on hold
          </h2>
          <p id="discovery-development-notice-description" className="mt-3 text-sm leading-6 text-white/65">
            Discovery Hub has received less development than other parts of LoreBook. You can still explore it,
            but some panels may be incomplete, experimental, or change when development resumes.
          </p>

          <button
            type="button"
            onClick={dismiss}
            className="mt-6 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Continue to Discovery Hub
          </button>
          <p className="mt-3 text-center text-[11px] text-white/35">
            This message will stay dismissed for this browser session.
          </p>
        </div>
      </div>
    </div>
  );
}

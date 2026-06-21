import { useCallback, useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const DISMISS_KEY = 'lorekeeper.openAiAvailabilityNoticeDismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** For tests — reset dismiss state between cases. */
export function resetOpenAiAvailabilityNoticeDismissed(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Static note for login / auth screens — explains live AI vs simulated guest/demo chat.
 */
export function OpenAiAvailabilityLoginNote({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2 text-left ${className}`}
      role="note"
      aria-label="AI availability notice"
    >
      <p className="text-[11px] sm:text-xs text-white/60 leading-relaxed">
        <span className="font-medium text-violet-300/90">Live AI chat</span> is available for{' '}
        <span className="text-white/75">Google sign-in</span> only. Guest and Demo modes use a
        built-in chat sim while OpenAI is unavailable to unsigned sessions.
      </p>
    </div>
  );
}

/**
 * Compact dismissible bar for guest/demo sessions — one line on mobile, slightly more on desktop.
 */
export function OpenAiAvailabilitySessionBar({ className = '' }: { className?: string }) {
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
  }, []);

  if (dismissed) return null;

  return (
    <div
      role="status"
      className={`w-full shrink-0 border-b border-violet-500/15 bg-violet-950/30 px-2 py-1 sm:px-3 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-white/55 select-none ${className}`}
    >
      <Sparkles className="h-3 w-3 shrink-0 text-violet-400/75" aria-hidden />
      <p className="flex-1 min-w-0 leading-snug">
        <span className="sm:hidden">
          Simulated AI · Google sign-in for live chat
        </span>
        <span className="hidden sm:inline">
          OpenAI chat is off in Guest/Demo — responses are simulated. Sign in with Google for live AI.
        </span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss AI availability notice"
        data-testid="openai-availability-notice-dismiss"
        className="shrink-0 rounded p-0.5 text-white/35 transition-colors hover:bg-white/10 hover:text-white/70"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

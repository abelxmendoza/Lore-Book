import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { IdentityOnboarding } from './IdentityOnboarding';

/**
 * Re-prompt for users (new OR existing) who haven't completed the narrative
 * onboarding. Checks /api/onboarding/status; if not completed, shows a dismissible
 * banner that opens the IdentityOnboarding flow. This is how existing accounts get
 * to build their Main Character profile.
 */

type Status = { completed: boolean; version: number; completedAt: string | null };

const DISMISS_KEY = 'onboarding_v2_reprompt_dismissed';

export const OnboardingReprompt = () => {
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && window.sessionStorage.getItem(DISMISS_KEY) === 'true',
  );

  const refresh = () => {
    fetchJson<Status>('/api/onboarding/status')
      .then((s) => setCompleted(!!s.completed))
      .catch(() => setCompleted(true)); // fail closed: don't nag on error
  };

  useEffect(() => {
    refresh();
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      /* ignore */
    }
  };

  if (completed === null || completed || dismissed) {
    return (
      <>
        {open && (
          <Overlay onClose={() => setOpen(false)}>
            <IdentityOnboarding
              onComplete={refresh}
              onClose={() => {
                setOpen(false);
                refresh();
              }}
            />
          </Overlay>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white">Build your Main Character in 2 minutes</div>
            <div className="text-xs text-white/55">
              Tell LoreBook about yourself once — it'll set up your profile, people, and goals automatically.
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto shrink-0 text-white/30 hover:text-white sm:hidden"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-full bg-primary px-4 py-2 text-xs font-medium text-white sm:w-auto sm:py-1.5"
          >
            Tell my story
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="hidden shrink-0 text-white/30 hover:text-white sm:block"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <IdentityOnboarding
            onComplete={refresh}
            onClose={() => {
              setOpen(false);
              refresh();
            }}
          />
        </Overlay>
      )}
    </>
  );
};

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-[6vh] sm:p-4 sm:pt-[8vh]"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

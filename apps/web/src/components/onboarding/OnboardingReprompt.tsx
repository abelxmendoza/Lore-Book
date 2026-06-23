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
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white">Build your Main Character in 2 minutes</div>
          <div className="text-xs text-white/55">
            Tell LoreBook about yourself once — it'll set up your profile, people, and goals automatically.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-white"
        >
          Tell my story
        </button>
        <button type="button" onClick={dismiss} className="shrink-0 text-white/30 hover:text-white" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

/**
 * ModeBadge — small persistent pill showing the active dev/guest/mock mode.
 * Only renders when in a non-standard mode. Silent in normal authenticated use.
 *
 * Placement: fixed, bottom-left, above any z-50 overlays.
 * Click a badge to dismiss it for the current browser session.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useGuest } from '../contexts/GuestContext';
import { useAppSelector } from '../store/hooks';
import { selectEffectiveUseMockData } from '../store/selectors';

const DEV_AUTH_BYPASS =
  typeof import.meta !== 'undefined' &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_DISABLE_AUTH === 'true';

type BadgeId = 'guest' | 'mock-data' | 'dev-auth';

const DISMISS_STORAGE_PREFIX = 'lk_mode_badge_dismissed_';

function readDismissed(id: BadgeId): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(`${DISMISS_STORAGE_PREFIX}${id}`) === 'true';
}

function writeDismissed(id: BadgeId, dismissed: boolean) {
  if (typeof window === 'undefined') return;
  const key = `${DISMISS_STORAGE_PREFIX}${id}`;
  if (dismissed) sessionStorage.setItem(key, 'true');
  else sessionStorage.removeItem(key);
}

interface Badge {
  id: BadgeId;
  label: string;
  color: string;
  title: string;
}

export const ModeBadge = () => {
  const { isGuest } = useGuest();
  const isMockData = useAppSelector(selectEffectiveUseMockData);
  const [dismissed, setDismissed] = useState<Record<BadgeId, boolean>>(() => ({
    guest: readDismissed('guest'),
    'mock-data': readDismissed('mock-data'),
    'dev-auth': readDismissed('dev-auth'),
  }));

  useEffect(() => {
    if (!isGuest && dismissed.guest) {
      setDismissed(prev => ({ ...prev, guest: false }));
      writeDismissed('guest', false);
    }
  }, [isGuest, dismissed.guest]);

  useEffect(() => {
    if (!isMockData && dismissed['mock-data']) {
      setDismissed(prev => ({ ...prev, 'mock-data': false }));
      writeDismissed('mock-data', false);
    }
  }, [isMockData, dismissed]);

  const dismissBadge = (id: BadgeId) => {
    setDismissed(prev => ({ ...prev, [id]: true }));
    writeDismissed(id, true);
  };

  const badges: Badge[] = [];

  if (DEV_AUTH_BYPASS && !dismissed['dev-auth']) {
    badges.push({
      id: 'dev-auth',
      label: 'Dev Auth',
      color: 'bg-purple-900/80 text-purple-200 border-purple-700/60',
      title: 'Auth bypass active (VITE_DEV_DISABLE_AUTH=true). Click to dismiss.',
    });
  }

  if (isGuest && !dismissed.guest) {
    badges.push({
      id: 'guest',
      label: 'Guest',
      color: 'bg-blue-900/80 text-blue-200 border-blue-700/60',
      title: 'Guest session active. Click to dismiss this indicator.',
    });
  }

  if (isMockData && !dismissed['mock-data']) {
    badges.push({
      id: 'mock-data',
      label: 'Mock Data',
      color: 'bg-amber-900/80 text-amber-200 border-amber-700/60',
      title: 'Mock data mode active — UI data is synthetic. Click to dismiss.',
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-1 items-start pointer-events-none">
      {badges.map((b) => (
        <button
          key={b.id}
          type="button"
          title={b.title}
          aria-label={`Dismiss ${b.label} indicator`}
          onClick={() => dismissBadge(b.id)}
          className={`pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wide backdrop-blur-sm cursor-pointer hover:opacity-90 transition-opacity ${b.color}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {b.label}
          <X className="h-3 w-3 opacity-60" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
};

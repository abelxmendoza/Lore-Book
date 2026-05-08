/**
 * ModeBadge — small persistent pill showing the active dev/guest/mock mode.
 * Only renders when in a non-standard mode. Silent in normal authenticated use.
 *
 * Placement: fixed, bottom-left, above any z-50 overlays.
 */

import { useGuest } from '../contexts/GuestContext';
import { getGlobalMockDataEnabled, subscribeToMockDataState } from '../contexts/MockDataContext';
import { useState, useEffect } from 'react';

const DEV_AUTH_BYPASS =
  typeof import.meta !== 'undefined' &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_DISABLE_AUTH === 'true';

interface Badge {
  label: string;
  color: string; // Tailwind bg + text classes
  title: string;
}

export const ModeBadge = () => {
  const { isGuest } = useGuest();
  const [isMockData, setIsMockData] = useState(getGlobalMockDataEnabled());

  // Keep in sync with the global mock-data toggle
  useEffect(() => {
    return subscribeToMockDataState(setIsMockData);
  }, []);

  const badges: Badge[] = [];

  if (DEV_AUTH_BYPASS) {
    badges.push({
      label: 'Dev Auth',
      color: 'bg-purple-900/80 text-purple-200 border-purple-700/60',
      title: 'Auth bypass active (VITE_DEV_DISABLE_AUTH=true). Backend uses dev-user id.',
    });
  }

  if (isGuest) {
    badges.push({
      label: 'Guest',
      color: 'bg-blue-900/80 text-blue-200 border-blue-700/60',
      title: 'Running as guest — memory writes are local only.',
    });
  }

  if (isMockData) {
    badges.push({
      label: 'Mock Data',
      color: 'bg-amber-900/80 text-amber-200 border-amber-700/60',
      title: 'Mock data mode active — UI data is synthetic, not from backend.',
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-1 items-start">
      {badges.map(b => (
        <span
          key={b.label}
          title={b.title}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wide backdrop-blur-sm ${b.color}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {b.label}
        </span>
      ))}
    </div>
  );
};

/**
 * ModeBadge — small persistent pill showing the active dev/guest/mock mode.
 * Only renders when in a non-standard mode. Silent in normal authenticated use.
 *
 * Placement: fixed, bottom-left, above any z-50 overlays.
 */

import { useNavigate } from 'react-router-dom';
import { useGuest } from '../contexts/GuestContext';
import { useAppSelector } from '../store/hooks';
import { selectEffectiveUseMockData } from '../store/selectors';

const DEV_AUTH_BYPASS =
  typeof import.meta !== 'undefined' &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DEV_DISABLE_AUTH === 'true';

interface Badge {
  label: string;
  color: string;
  title: string;
  onClick?: () => void;
}

export const ModeBadge = () => {
  const navigate = useNavigate();
  const { isGuest } = useGuest();
  const isMockData = useAppSelector(selectEffectiveUseMockData);

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
      title: 'Guest session — click to open guest account & upgrade options.',
      onClick: () => navigate('/account'),
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
      {badges.map((b) => {
        const className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wide backdrop-blur-sm ${b.color} ${b.onClick ? 'cursor-pointer hover:opacity-90' : ''}`;
        if (b.onClick) {
          return (
            <button
              key={b.label}
              type="button"
              title={b.title}
              onClick={b.onClick}
              className={className}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {b.label}
            </button>
          );
        }
        return (
          <span key={b.label} title={b.title} className={className}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {b.label}
          </span>
        );
      })}
    </div>
  );
};

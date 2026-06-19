import { useEffect, useState } from 'react';

import { BookGhostScene } from './BookGhostScene';
import { useRuntimeIdentity } from '../../hooks/useRuntimeIdentity';
import { wasWelcomeSplashSeen, markWelcomeSplashSeen } from '../../lib/welcomeSplash';
import './WelcomeSplash.css';

/** How long the splash stays before it auto-dismisses. */
const VISIBLE_MS = 3400;
/** Fade-out duration (kept in sync with the CSS transition). */
const FADE_MS = 600;

type Phase = 'hidden' | 'visible' | 'leaving';

/**
 * Welcome splash with the ghost-from-the-book animation. Shown once per browser
 * session for real, guest, and demo users — persists across refresh and resets
 * on logout (see lib/welcomeSplash + AuthGate / GuestContext).
 *
 * Auto-dismisses after {@link VISIBLE_MS}; tapping anywhere skips it early.
 * Renders nothing once it has been seen this session.
 */
export function WelcomeSplash() {
  const { is } = useRuntimeIdentity();

  const [phase, setPhase] = useState<Phase>(() =>
    wasWelcomeSplashSeen() ? 'hidden' : 'visible'
  );

  // Mark as seen + schedule auto-dismiss as soon as it becomes visible.
  useEffect(() => {
    if (phase !== 'visible') return;
    markWelcomeSplashSeen();
    const timer = setTimeout(() => setPhase('leaving'), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // After the fade-out completes, unmount.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => setPhase('hidden'), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'hidden') return null;

  const title = is.demo ? 'Welcome to the LoreBook demo' : 'Welcome to LoreBook';
  const subtitle = is.demo
    ? 'Exploring with sample data…'
    : is.guest
      ? 'Your guest story begins…'
      : 'Summoning your story from the pages…';

  return (
    <div
      className={['welcome-splash', phase === 'leaving' && 'welcome-splash--leaving']
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      data-testid="welcome-splash"
      onClick={() => setPhase('leaving')}
    >
      <div className="lore-generating-screen welcome-splash__screen">
        <BookGhostScene />
        <h2 className="lore-generating-title">{title}</h2>
        <p className="lore-generating-stage">{subtitle}</p>
        <p className="welcome-splash__hint">tap anywhere to continue</p>
      </div>
    </div>
  );
}

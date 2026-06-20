import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { BookGhostScene } from './BookGhostScene';
import { useRuntimeIdentity } from '../../hooks/useRuntimeIdentity';
import {
  clearWelcomeSplashPending,
  markWelcomeSplashSeen,
  shouldShowWelcomeSplash,
  subscribeWelcomeSplash,
} from '../../lib/welcomeSplash';
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
 * Mounted globally from Router so it can appear immediately when Guest/Demo is
 * clicked on the login screen, before lazy-loaded routes finish loading.
 *
 * Auto-dismisses after {@link VISIBLE_MS}; tapping anywhere skips it early.
 * Renders nothing once it has been seen this session.
 */
export function WelcomeSplash() {
  const { pathname } = useLocation();
  const { is } = useRuntimeIdentity();

  const wantsSplash = useCallback(
    () => shouldShowWelcomeSplash(pathname),
    [pathname],
  );

  const [phase, setPhase] = useState<Phase>(() =>
    wantsSplash() ? 'visible' : 'hidden',
  );

  // Re-evaluate when route changes or guest/demo entry requests the splash.
  useEffect(() => {
    return subscribeWelcomeSplash(() => {
      if (wantsSplash()) {
        setPhase('visible');
      }
    });
  }, [wantsSplash]);

  useEffect(() => {
    if (wantsSplash() && phase === 'hidden') {
      setPhase('visible');
    }
  }, [pathname, wantsSplash, phase]);

  // Mark as seen + schedule auto-dismiss as soon as it becomes visible.
  useEffect(() => {
    if (phase !== 'visible') return;
    markWelcomeSplashSeen();
    clearWelcomeSplashPending();
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

/**
 * Once-per-session gate for the welcome splash.
 *
 * Backed by sessionStorage so the splash:
 *  - shows once when the user enters the app (login / guest / demo),
 *  - does NOT re-show on refresh (sessionStorage survives reloads in the tab),
 *  - shows again on a fresh login (the flag is reset on logout / guest entry,
 *    and sessionStorage is naturally cleared when the tab/session ends).
 *
 * `requestWelcomeSplash()` sets a pending flag so the splash can appear
 * immediately on the login screen before route navigation / lazy loading.
 */
const SEEN_KEY = 'lorekeeper.welcomeSplashSeen';
const PENDING_KEY = 'lorekeeper.welcomeSplashPending';

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyWelcomeSplashChange(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeWelcomeSplash(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function wasWelcomeSplashSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // sessionStorage unavailable (private mode / SSR) — treat as not seen.
    return false;
  }
}

export function markWelcomeSplashSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable — splash simply won't be remembered */
  }
}

export function resetWelcomeSplash(): void {
  try {
    sessionStorage.removeItem(SEEN_KEY);
  } catch {
    /* storage unavailable — nothing to reset */
  }
  notifyWelcomeSplashChange();
}

/** Show the splash as soon as possible (e.g. on Guest/Demo click before navigate). */
export function requestWelcomeSplash(): void {
  resetWelcomeSplash();
  try {
    sessionStorage.setItem(PENDING_KEY, '1');
  } catch {
    /* storage unavailable */
  }
  notifyWelcomeSplashChange();
}

export function isWelcomeSplashPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearWelcomeSplashPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Public marketing / auth pages where the splash should not auto-appear. */
const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/features',
  '/investors',
  '/about',
  '/terms',
  '/privacy-policy',
  '/auth/callback',
  '/upgrade',
  '/404',
]);

export function isPublicWelcomeRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname);
}

export function shouldShowWelcomeSplash(pathname: string): boolean {
  if (wasWelcomeSplashSeen()) return false;
  if (isWelcomeSplashPending()) return true;
  return !isPublicWelcomeRoute(pathname);
}

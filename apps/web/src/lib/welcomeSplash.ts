/**
 * Once-per-session gate for the welcome splash.
 *
 * Backed by sessionStorage so the splash:
 *  - shows once when the user enters the app (login / guest / demo),
 *  - does NOT re-show on refresh (sessionStorage survives reloads in the tab),
 *  - shows again on a fresh login (the flag is reset on logout / guest entry,
 *    and sessionStorage is naturally cleared when the tab/session ends).
 */
const KEY = 'lorekeeper.welcomeSplashSeen';

export function wasWelcomeSplashSeen(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    // sessionStorage unavailable (private mode / SSR) — treat as not seen.
    return false;
  }
}

export function markWelcomeSplashSeen(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable — splash simply won't be remembered */
  }
}

export function resetWelcomeSplash(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing to reset */
  }
}

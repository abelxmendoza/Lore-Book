/**
 * Demo runtime isolation — public `/demo` must never surface an authenticated
 * user's account chrome, composer drafts, chat threads, or API-backed lore.
 *
 * Isolation is session-scoped via sessionStorage so in-demo navigation can leave
 * `/demo` paths temporarily without flipping back to REAL_USER data mode.
 * Cleared on explicit login / exit.
 */

export const DEMO_SESSION_KEY = 'lk_demo_runtime';
export const DEMO_THREAD_STORAGE_ID = 'demo';

/** True while this tab is in the public demo sandbox. */
export function isDemoRuntimeActive(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname === '/demo' || window.location.pathname.startsWith('/demo/')) {
    return true;
  }
  try {
    return sessionStorage.getItem(DEMO_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Enter the demo sandbox (idempotent). */
export function enterDemoRuntime(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
  } catch {
    // ignore quota / private-mode failures — pathname check still covers /demo
  }
}

/** Exit demo sandbox (call on real login / "exit demo"). */
export function clearDemoSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Storage namespace for demo-local chat threads. Never the authenticated user id.
 */
export function demoThreadStorageUserId(): string {
  return DEMO_THREAD_STORAGE_ID;
}

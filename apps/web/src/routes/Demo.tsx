/**
 * DemoRuntime — public DEMO route, no auth required.
 *
 * Isolation contract:
 *   - Never touches Supabase auth (no session check, no ToS gate)
 *   - Forces useMockData=true so all data hooks emit synthetic cognition only
 *   - Creates an ephemeral guest session (localStorage, never written to backend)
 *   - Sets sessionStorage flag so demo mode survives in-session navigation to
 *     non-/demo routes (e.g. /characters from the sidebar) and page refreshes
 *     during the session. Flag is cleared when the user logs in.
 *   - NEVER shares cognition state with REAL runtime
 */

import { useEffect } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import { useGuest } from '../contexts/GuestContext';
import App from '../pages/App';

const DEMO_SESSION_KEY = 'lk_demo_runtime';

export default function DemoRuntime() {
  const { setUseMockData } = useMockData();
  const { isGuest, startGuestSession } = useGuest();

  useEffect(() => {
    // Mark this session as a demo runtime — checked by MockDataContext on refresh
    sessionStorage.setItem(DEMO_SESSION_KEY, 'true');

    // Activate synthetic cognition — no-op if already set by MockDataContext init
    setUseMockData(true);

    // Create an ephemeral guest identity if none exists
    if (!isGuest) startGuestSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <App defaultSurface="chat" />;
}

/** Call this when the user explicitly exits demo mode (e.g. clicks "Log in"). */
export function clearDemoSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
}

/**
 * True when this tab is in a demo runtime. A demo session has no Supabase auth
 * token, so every API call is unauthenticated → mock data only; it grants the
 * app shell the same no-data-exposure access as a guest session.
 */
export function isDemoSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(DEMO_SESSION_KEY) === 'true';
}

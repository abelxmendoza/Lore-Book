/**
 * DemoRuntime — public DEMO route, no auth required.
 *
 * Isolation contract:
 *   - Never uses the authenticated user's session for data, chat, or chrome
 *   - Forces useMockData=true so all data hooks emit synthetic cognition only
 *   - Creates an ephemeral guest session (localStorage, never written to backend)
 *   - Clears in-memory composer drafts so private lore cannot leak into the demo box
 *   - Sets sessionStorage flag so demo mode survives in-session navigation to
 *     non-/demo routes (e.g. /characters from the sidebar) and page refreshes
 *     during the session. Flag is cleared when the user logs in / exits demo.
 *   - NEVER shares cognition state with REAL runtime
 */

import { useLayoutEffect } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import { useGuest } from '../contexts/GuestContext';
import { enterDemoRuntime } from '../lib/demoRuntime';
import { useAppDispatch } from '../store/hooks';
import { clearComposerState } from '../store/slices/composerSlice';
import { setCurrentThreadId } from '../store/slices/chatSlice';
import App from '../pages/App';

export { clearDemoSession, isDemoRuntimeActive as isDemoSession } from '../lib/demoRuntime';

export default function DemoRuntime() {
  const { setUseMockData } = useMockData();
  const { isGuest, startGuestSession } = useGuest();
  const dispatch = useAppDispatch();

  // useLayoutEffect: isolate before paint so private drafts / account chrome
  // never flash into the public demo surface.
  useLayoutEffect(() => {
    enterDemoRuntime();

    // Activate synthetic cognition — allowed even when a Supabase session exists.
    setUseMockData(true);

    // Wipe any authenticated-session composer draft / active thread from Redux
    // so private lore typed in a real chat cannot appear in the demo text box.
    dispatch(clearComposerState());
    dispatch(setCurrentThreadId(null));

    // Create an ephemeral guest identity for demo chrome (not the real account).
    if (!isGuest) startGuestSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronous path check — enterDemoRuntime also runs here so the first
  // child render already sees isDemoRuntimeActive() === true via /demo pathname.
  enterDemoRuntime();

  return <App defaultSurface="chat" />;
}

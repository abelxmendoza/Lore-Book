import { Presentation, ToggleLeft, ToggleRight, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMockData } from '../contexts/MockDataContext';

// Key written by DemoRuntime when the demo session starts
const DEMO_SESSION_KEY = 'lk_demo_runtime';

/**
 * Persistent banner shown for the full duration of a demo session.
 * Visibility is tied to the session flag, NOT to whether sample data is on —
 * so the toggle stays reachable even after the user turns sample data off.
 */
export function DemoModeBanner() {
  const { runtimeDataMode, useMockData: isPopulated, toggleMockData } = useMockData();
  const navigate = useNavigate();

  // Stay visible for the entire demo session regardless of mock-data toggle state.
  // Without this, turning off sample data causes runtimeDataMode to leave DEMO,
  // the banner disappears, and there is no way to turn sample data back on.
  const isDemoSession =
    typeof window !== 'undefined' &&
    sessionStorage.getItem(DEMO_SESSION_KEY) === 'true';

  if (runtimeDataMode !== 'DEMO' && !isDemoSession) return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-4 text-xs select-none"
    >
      {/* Left: mode label */}
      <div className="flex items-center gap-2 text-amber-400/90 font-mono shrink-0">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        <Presentation className="h-3.5 w-3.5" />
        Demo Mode
      </div>

      {/* Center: populated / empty toggle */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium transition-colors ${!isPopulated ? 'text-white/70' : 'text-white/30'}`}>
          Empty state
        </span>
        <button
          type="button"
          onClick={toggleMockData}
          className="flex items-center focus:outline-none"
          aria-label={isPopulated ? 'Switch to empty state' : 'Switch to sample data'}
        >
          {isPopulated ? (
            <ToggleRight className="h-6 w-6 text-amber-400" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-white/40" />
          )}
        </button>
        <span className={`text-xs font-medium transition-colors ${isPopulated ? 'text-amber-300' : 'text-white/30'}`}>
          Sample data
        </span>
      </div>

      {/* Right: sign-in CTA */}
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors shrink-0"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </button>
    </div>
  );
}

import { FileArchive, Presentation, Sparkles, ToggleLeft, ToggleRight, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useMockData } from '../contexts/MockDataContext';
import { openChatGPTImportDemo } from '../lib/chatGPTImportDemo';
import { openOnboardingDemo } from '../lib/onboardingDemo';
import {
  getDemoActivityCounts,
  type DemoActivityCounts,
} from '../services/demoMutationEffects';

const DEMO_SESSION_KEY = 'lk_demo_runtime';

/**
 * Compact demo session bar — stays shrink-0 so book pages scroll beneath it.
 */
export function DemoModeBanner() {
  const { runtimeDataMode, useMockData: isPopulated, toggleMockData } = useMockData();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<DemoActivityCounts>(() => getDemoActivityCounts());

  useEffect(() => {
    const refresh = () => setActivity(getDemoActivityCounts());
    refresh();
    window.addEventListener('lk:demo-activity-updated', refresh);
    return () => window.removeEventListener('lk:demo-activity-updated', refresh);
  }, []);

  const activitySummary = [
    activity.quests > 0 ? `${activity.quests} quest${activity.quests === 1 ? '' : 's'}` : null,
    activity.characters > 0 ? `${activity.characters} edit${activity.characters === 1 ? '' : 's'}` : null,
    activity.places > 0 ? `${activity.places} place${activity.places === 1 ? '' : 's'}` : null,
    activity.skills > 0 ? `${activity.skills} skill${activity.skills === 1 ? '' : 's'}` : null,
    activity.memories > 0 ? `${activity.memories} memor${activity.memories === 1 ? 'y' : 'ies'}` : null,
  ].filter(Boolean).join(' · ');

  const isDemoSession =
    typeof window !== 'undefined' &&
    sessionStorage.getItem(DEMO_SESSION_KEY) === 'true';

  if (runtimeDataMode !== 'DEMO' && !isDemoSession) return null;

  return (
    <div
      role="status"
      className="w-full shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-2 py-1 sm:px-3 text-[11px] select-none"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:gap-x-3">
        <div className="flex items-center gap-1 text-amber-400/90 font-mono min-w-0 shrink-0">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <Presentation className="h-3 w-3 shrink-0" />
          <span className="truncate">Demo</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`text-[10px] font-medium ${!isPopulated ? 'text-white/70' : 'text-white/35'}`}
          >
            Empty
          </span>
          <button
            type="button"
            onClick={toggleMockData}
            className="flex items-center rounded p-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
            aria-label={isPopulated ? 'Switch to empty state' : 'Switch to sample data'}
          >
            {isPopulated ? (
              <ToggleRight className="h-5 w-5 text-amber-400" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-white/40" />
            )}
          </button>
          <span
            className={`text-[10px] font-medium whitespace-nowrap ${isPopulated ? 'text-amber-300' : 'text-white/35'}`}
          >
            Sample data
          </span>
        </div>

        {isPopulated && activitySummary ? (
          <p className="hidden sm:block flex-1 min-w-0 text-[10px] text-amber-200/55 font-mono truncate text-center">
            {activitySummary}
          </p>
        ) : null}

        <button
          type="button"
          onClick={openOnboardingDemo}
          className="ml-auto flex items-center gap-1 text-violet-200/70 hover:text-violet-100 transition-colors shrink-0 px-1 py-0.5"
          aria-label="Open onboarding demo"
        >
          <Sparkles className="h-3 w-3" />
          <span className="hidden sm:inline">Onboarding</span>
        </button>

        <button
          type="button"
          onClick={openChatGPTImportDemo}
          className="flex items-center gap-1 text-cyan-200/70 hover:text-cyan-100 transition-colors shrink-0 px-1 py-0.5"
          aria-label="Open ChatGPT import demo"
        >
          <FileArchive className="h-3 w-3" />
          <span className="hidden sm:inline">Import demo</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="flex items-center gap-1 text-white/50 hover:text-white transition-colors shrink-0 px-1 py-0.5"
          aria-label="Sign in"
        >
          <LogIn className="h-3 w-3" />
          <span className="hidden sm:inline">Sign in</span>
        </button>
      </div>
    </div>
  );
};

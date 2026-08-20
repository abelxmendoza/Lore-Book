import { BookOpen, CalendarDays, Compass, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { isDemoRuntimeActive } from '../../lib/demoRuntime';
import { LIFE_STORY_HINT, LIFE_STORY_JOB } from '../../lib/lifeStoryCopy';
import { getRuntimeRouteFromSurface, type SurfaceKey } from '../../utils/routeMapping';

export type StorySurface = 'moments' | 'timeline' | 'anchors' | 'saga';

const SURFACES: Array<{
  id: StorySurface;
  label: string;
  route: SurfaceKey;
  search?: string;
  icon: typeof Sparkles;
}> = [
  { id: 'moments', label: 'Moments', route: 'timeline', search: '?view=moments', icon: Sparkles },
  { id: 'timeline', label: 'Timeline', route: 'timeline', search: '?view=events', icon: CalendarDays },
  { id: 'anchors', label: 'Anchors', route: 'anchors', icon: Compass },
  { id: 'saga', label: 'Life Saga', route: 'saga', icon: BookOpen },
];

type Props = {
  current: StorySurface;
  className?: string;
  /** Hide the one-sentence job when the page header already says it. */
  showJob?: boolean;
};

function hrefFor(surface: (typeof SURFACES)[number]): string {
  const base = getRuntimeRouteFromSurface(surface.route, isDemoRuntimeActive());
  return `${base}${surface.search ?? ''}`;
}

/**
 * One-hop map across Moments, Timeline, Anchors, and Life Saga —
 * plus a plain-language job line for the page you are on.
 */
export function StorySurfaceLinks({ current, className = '', showJob = true }: Props) {
  const navigate = useNavigate();
  const currentMeta = SURFACES.find((surface) => surface.id === current);

  return (
    <div className={className}>
      {showJob && currentMeta && (
        <p className="max-w-xl text-sm leading-relaxed text-white/55" data-testid="life-story-job">
          {LIFE_STORY_JOB[current]}
        </p>
      )}
      <nav
        aria-label="How to look at your life"
        className={`flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs ${showJob ? 'mt-2.5' : ''}`}
      >
        <span className="mr-1 text-white/30">Look at your life</span>
        {SURFACES.map((surface, index) => {
          const Icon = surface.icon;
          const isCurrent = surface.id === current;
          const hint = LIFE_STORY_HINT[surface.id];
          return (
            <span key={surface.id} className="inline-flex items-center gap-1">
              {index > 0 && <span className="mx-0.5 text-white/15" aria-hidden>·</span>}
              {isCurrent ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 font-medium text-white"
                  aria-current="page"
                  title={hint}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {surface.label}
                  <span className="hidden sm:inline font-normal text-white/45">· {hint}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(hrefFor(surface))}
                  title={hint}
                  className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-white/50 transition-colors hover:border-white/15 hover:bg-white/5 hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {surface.label}
                  <span className="hidden sm:inline text-white/30">· {hint}</span>
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

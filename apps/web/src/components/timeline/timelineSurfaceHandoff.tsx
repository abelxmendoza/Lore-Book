import { BookOpen, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { isDemoRuntimeActive } from '../../lib/demoRuntime';
import { getRuntimeRouteFromSurface } from '../../utils/routeMapping';

type HandoffLinkProps = {
  compact?: boolean;
  className?: string;
};

const defaultClass =
  'inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-fuchsia-100/90 shadow-[0_0_18px_rgba(232,121,249,0.18)] transition-colors hover:border-fuchsia-300/50 hover:bg-fuchsia-500/18 hover:text-white touch-manipulation';

export function LifeSagaLink({ compact = false, className = '' }: HandoffLinkProps) {
  const navigate = useNavigate();
  const href = getRuntimeRouteFromSurface('saga', isDemoRuntimeActive());

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={[defaultClass, className].filter(Boolean).join(' ')}
      data-testid="read-in-life-saga"
      title="Read chapters and arcs in Life Saga"
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {compact ? 'Life Saga' : 'Read in Life Saga'}
    </button>
  );
}

export function ViewOnTimelineLink({ compact = false, className = '' }: HandoffLinkProps) {
  const navigate = useNavigate();
  const href = `${getRuntimeRouteFromSurface('timeline', isDemoRuntimeActive())}?view=events`;

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={[defaultClass, className].filter(Boolean).join(' ')}
      data-testid="view-on-timeline"
      title="See what happened, in time"
    >
      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {compact ? 'Chronology' : 'View chronology'}
    </button>
  );
}

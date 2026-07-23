import { CalendarDays, Compass, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type StorySurface = 'moments' | 'timeline' | 'anchors';

const SURFACES: Array<{
  id: StorySurface;
  label: string;
  href: string;
  icon: typeof Sparkles;
  hint: string;
}> = [
  {
    id: 'moments',
    label: 'Moments',
    href: '/events',
    icon: Sparkles,
    hint: 'Life scenes from conversations',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    href: '/timeline?view=events',
    icon: CalendarDays,
    hint: 'Same scenes in chronological order',
  },
  {
    id: 'anchors',
    label: 'Anchors',
    href: '/narrative-anchors',
    icon: Compass,
    hint: 'Chapters those scenes belong to',
  },
];

type Props = {
  current: StorySurface;
  className?: string;
};

/**
 * Quiet interconnect between Life Log Moments, Omni Timeline, and Narrative Anchors.
 * Not a competing tab row — just one-hop navigation across the story stack.
 */
export function StorySurfaceLinks({ current, className = '' }: Props) {
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Connected story views"
      className={`flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs ${className}`}
    >
      <span className="mr-1 text-white/30">Connected</span>
      {SURFACES.map((surface, index) => {
        const Icon = surface.icon;
        const isCurrent = surface.id === current;
        return (
          <span key={surface.id} className="inline-flex items-center gap-1">
            {index > 0 && <span className="mx-0.5 text-white/15" aria-hidden>·</span>}
            {isCurrent ? (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 font-medium text-white"
                aria-current="page"
                title={surface.hint}
              >
                <Icon className="h-3.5 w-3.5" />
                {surface.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(surface.href)}
                title={surface.hint}
                className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-white/50 transition-colors hover:border-white/15 hover:bg-white/5 hover:text-white"
              >
                <Icon className="h-3.5 w-3.5" />
                {surface.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

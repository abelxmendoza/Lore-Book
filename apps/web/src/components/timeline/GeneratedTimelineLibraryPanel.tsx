import { useState } from 'react';
import { BookMarked, ChevronDown, ChevronUp, Trash2, Sparkles } from 'lucide-react';
import type { SavedGeneratedTimeline } from '../../lib/generatedTimelinesLibrary';

type Props = {
  timelines: SavedGeneratedTimeline[];
  activeId?: string | null;
  onOpen: (timeline: SavedGeneratedTimeline) => void;
  onRemove: (id: string) => void;
  className?: string;
  defaultExpanded?: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function GeneratedTimelineLibraryPanel({
  timelines,
  activeId,
  onOpen,
  onRemove,
  className = '',
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || timelines.length > 0);

  if (timelines.length === 0) return null;

  return (
    <section
      className={`omni-timeline-library overflow-hidden ${className}`}
      data-testid="generated-timeline-library"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="omni-timeline-library__toggle w-full flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 text-left touch-manipulation"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <BookMarked className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-white truncate">Timelines library</span>
          <span className="omni-timeline-library__count shrink-0">
            {timelines.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white/40 shrink-0" />
        )}
      </button>

      {expanded && (
        <ul className="border-t border-white/8 max-h-[min(240px,40vh)] overflow-y-auto divide-y divide-white/6">
          {timelines.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(t)}
                  className={`omni-timeline-library__item flex-1 min-w-0 text-left px-3 py-2.5 sm:px-4 touch-manipulation ${
                    active ? 'omni-timeline-library__item--active' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className={`h-3 w-3 shrink-0 ${active ? 'text-primary' : 'text-white/35'}`} />
                    <span className={`text-sm truncate ${active ? 'text-white font-medium' : 'text-white/85'}`}>
                      {t.query}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {t.events.length} moment{t.events.length !== 1 ? 's' : ''}
                    {t.isMock ? ' · preview' : ''}
                    {' · '}
                    {formatWhen(t.updatedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(t.id);
                  }}
                  className="shrink-0 px-3 text-white/30 hover:text-red-300 hover:bg-red-500/10 touch-manipulation"
                  aria-label={`Remove ${t.query} from library`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

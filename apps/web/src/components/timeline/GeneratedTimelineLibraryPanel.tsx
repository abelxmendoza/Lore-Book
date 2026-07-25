import { useState } from 'react';
import {
  BookMarked,
  ChevronDown,
  ChevronUp,
  Clock3,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { SavedGeneratedTimeline } from '../../lib/generatedTimelinesLibrary';

type LorebookAvailability = {
  canCreate: boolean;
  reason: string;
};

type Props = {
  timelines: SavedGeneratedTimeline[];
  activeId?: string | null;
  onOpen: (timeline: SavedGeneratedTimeline) => void;
  onRemove: (id: string) => void;
  /** Open LoreBook creator prefilled from this saved timeline. */
  onCreateLorebook?: (timeline: SavedGeneratedTimeline) => void;
  canCreateLorebook?: (timeline: SavedGeneratedTimeline) => LorebookAvailability;
  className?: string;
  defaultExpanded?: boolean;
};

/** Timeline-unique palette (cyan/sky) — distinct from LoreBooks’ violet shelf. */
const TIMELINE_CARD_STYLES = [
  {
    gradient: 'from-cyan-600 to-sky-800',
    accent: 'text-cyan-300',
    border: 'border-cyan-500/25',
    glow: 'hover:shadow-cyan-950/40',
  },
  {
    gradient: 'from-teal-600 to-emerald-800',
    accent: 'text-teal-300',
    border: 'border-teal-500/25',
    glow: 'hover:shadow-teal-950/40',
  },
  {
    gradient: 'from-sky-600 to-indigo-800',
    accent: 'text-sky-300',
    border: 'border-sky-500/25',
    glow: 'hover:shadow-sky-950/40',
  },
  {
    gradient: 'from-indigo-600 to-violet-900',
    accent: 'text-indigo-300',
    border: 'border-indigo-500/25',
    glow: 'hover:shadow-indigo-950/40',
  },
] as const;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function spanLabel(events: SavedGeneratedTimeline['events']): string | null {
  const times = events
    .map((e) => new Date(e.start_time).getTime())
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
  const a = min.toLocaleDateString(undefined, opts);
  const b = max.toLocaleDateString(undefined, opts);
  return a === b ? a : `${a} – ${b}`;
}

export function GeneratedTimelineLibraryPanel({
  timelines,
  activeId,
  onOpen,
  onRemove,
  onCreateLorebook,
  canCreateLorebook,
  className = '',
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || timelines.length > 0);

  if (timelines.length === 0) return null;

  return (
    <section
      className={[
        'omni-timeline-library relative overflow-hidden rounded-2xl',
        'border border-cyan-500/20',
        'bg-gradient-to-br from-[#061018] via-black/80 to-[#0a0614]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="generated-timeline-library"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 12% 0%, rgba(34,211,238,0.10), transparent 55%), radial-gradient(ellipse 55% 45% at 90% 100%, rgba(56,189,248,0.07), transparent 50%)',
        }}
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="relative z-[1] w-full flex items-center justify-between gap-2 px-3.5 py-3 sm:px-4 sm:py-3.5 text-left touch-manipulation hover:bg-white/[0.03] transition-colors"
        aria-expanded={expanded}
        data-testid="generated-timeline-library-toggle"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 shrink-0">
            <Clock3 className="h-4 w-4 text-cyan-300" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3
                className="text-sm sm:text-base font-semibold text-white truncate"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Timelines Library
              </h3>
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider text-cyan-200/90 bg-cyan-500/15 border border-cyan-400/30">
                {timelines.length}
              </span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5 truncate">
              Generated timelines you’ve already spun up
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white/40 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="relative z-[1] border-t border-white/8 px-3 pb-3.5 pt-3 sm:px-4 sm:pb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-white/35 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-cyan-400/50" />
              Your generated timelines
            </p>
            <span className="text-[10px] font-mono text-white/25">
              {timelines.length} saved
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[min(420px,52vh)] overflow-y-auto overscroll-contain pr-0.5">
            {timelines.map((timeline, index) => {
              const style = TIMELINE_CARD_STYLES[index % TIMELINE_CARD_STYLES.length]!;
              const active = timeline.id === activeId;
              const span = spanLabel(timeline.events);
              const lore =
                canCreateLorebook?.(timeline) ??
                ({
                  canCreate: false,
                  reason: 'Open this timeline to check LoreBook readiness.',
                } satisfies LorebookAvailability);

              return (
                <article
                  key={timeline.id}
                  className={[
                    'group relative flex items-stretch gap-0 rounded-2xl border overflow-hidden text-left transition-all',
                    'hover:-translate-y-0.5 hover:shadow-xl',
                    style.border,
                    style.glow,
                    active
                      ? 'ring-1 ring-cyan-400/45 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid={`generated-timeline-card-${timeline.id}`}
                  data-active={active ? 'true' : 'false'}
                >
                  <div
                    className={`w-12 sm:w-14 shrink-0 bg-gradient-to-b ${style.gradient} flex flex-col items-center justify-center gap-1.5`}
                  >
                    <Clock3 className="h-5 w-5 text-white/70" />
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 bg-white/[0.03] group-hover:bg-white/[0.055] transition-colors px-3.5 py-3.5 sm:px-4">
                    <div className="min-w-0">
                      <p
                        className={`text-[10px] font-mono uppercase tracking-wider mb-1 ${style.accent}`}
                      >
                        {timeline.isMock
                          ? 'Simulated preview'
                          : active
                            ? 'Open now'
                            : 'Generated timeline'}
                      </p>
                      <h4
                        className="text-white font-semibold text-sm sm:text-[15px] leading-snug mb-1 line-clamp-2"
                        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                      >
                        {timeline.query}
                      </h4>
                      <p className="text-[11px] text-white/40">
                        {span ?? formatWhen(timeline.updatedAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5 pt-2.5 border-t border-white/8 text-[11px] text-white/35">
                      <span>
                        {timeline.events.length} moment
                        {timeline.events.length !== 1 ? 's' : ''}
                      </span>
                      {timeline.arcTitles.length > 0 && (
                        <>
                          <span className="text-white/15">·</span>
                          <span>
                            {timeline.arcTitles.length} arc
                            {timeline.arcTitles.length !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                      <span className="text-white/15">·</span>
                      <span>{formatWhen(timeline.updatedAt)}</span>
                    </div>

                    {timeline.arcTitles.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-white/30 line-clamp-1">
                        {timeline.arcTitles.slice(0, 3).join(' · ')}
                        {timeline.arcTitles.length > 3
                          ? ` +${timeline.arcTitles.length - 3}`
                          : ''}
                      </p>
                    )}

                    <div className="flex gap-1.5 mt-3">
                      <button
                        type="button"
                        onClick={() => onOpen(timeline)}
                        className="flex-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-100 text-xs font-medium py-2 transition-colors touch-manipulation"
                        data-testid={`generated-timeline-open-${timeline.id}`}
                      >
                        Open
                      </button>
                      {onCreateLorebook && (
                        <button
                          type="button"
                          onClick={() => onCreateLorebook(timeline)}
                          disabled={!lore.canCreate}
                          title={lore.reason}
                          className="flex-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-100 text-xs font-medium py-2 transition-colors inline-flex items-center justify-center gap-1 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-500/15"
                          data-testid={`generated-timeline-lorebook-${timeline.id}`}
                          aria-label={
                            lore.canCreate
                              ? `Make LoreBook from ${timeline.query}`
                              : `LoreBook not ready: ${lore.reason}`
                          }
                        >
                          <BookMarked className="h-3 w-3" />
                          LoreBook
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(timeline.id)}
                        className="shrink-0 w-9 rounded-lg bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-400/30 text-white/40 hover:text-red-300 transition-colors inline-flex items-center justify-center touch-manipulation"
                        aria-label={`Remove ${timeline.query} from library`}
                        data-testid={`generated-timeline-remove-${timeline.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

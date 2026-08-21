import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Clock, List, Loader2, Waves } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';
import { sortTimelineEventsChronologically } from '../../lib/timelineSort';
import { EventTimelineSwimlanes, type SwimlaneEvent, type SwimlaneLane } from '../timeline/EventTimelineSwimlanes';

export type TimelinePanelEvent = SwimlaneEvent;

type ViewMode = 'list' | 'swimlanes';

export interface EntityTimelinePanelProps<E extends TimelinePanelEvent, L extends { id: string; date: string } = E> {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: { label: string; hint?: string; testId?: string };
  lanes: SwimlaneLane[];
  /** Drives the swimlanes view — must be lane-shaped events only (e.g. no memories mixed in). */
  events: E[];
  /**
   * Overrides what the List view renders, when it needs to show more/different
   * items than the swimlanes (e.g. Character mixes events + memories in List
   * but only plots events on Swimlanes). Defaults to `events` when omitted.
   * Requires `renderListItem` — the default renderer assumes list items look
   * like swimlane events.
   */
  listItems?: L[];
  loading?: boolean;
  emptyTitle: string;
  emptyHint: string;
  onEventSelect?: (event: E) => void;
  /**
   * Full custom row for a List item, including its own accent dot — the
   * shell only supplies the automatic dot for the default renderer. Required
   * when `listItems` is set to a shape other than `E`.
   */
  renderListItem?: (item: L) => ReactNode;
  /** Defaults to lane counts + date range. Pass null to render no footer. */
  footer?: ReactNode | null;
  /** Same responsive default as the reference implementation: swimlanes ≥640px, list below. */
  defaultView?: ViewMode;
}

function fmtEventDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown date';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
  }
}

function laneAccentDot(lanes: SwimlaneLane[], laneKey: string): string {
  const lane = lanes.find((l) => l.key === laneKey);
  switch (lane?.accent) {
    case 'emerald': return 'bg-emerald-400';
    case 'sky': return 'bg-sky-400';
    case 'violet': return 'bg-violet-400';
    case 'amber': return 'bg-amber-400';
    case 'rose': return 'bg-rose-400';
    case 'cyan': return 'bg-cyan-400';
    default: return 'bg-slate-400';
  }
}

export function EntityTimelinePanel<E extends TimelinePanelEvent, L extends { id: string; date: string } = E>({
  icon: Icon,
  title,
  subtitle,
  badge,
  lanes,
  events,
  listItems,
  loading = false,
  emptyTitle,
  emptyHint,
  onEventSelect,
  renderListItem,
  footer,
  defaultView,
}: EntityTimelinePanelProps<E, L>) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (defaultView) return defaultView;
    if (typeof window === 'undefined') return 'list';
    return window.matchMedia('(min-width: 640px)').matches ? 'swimlanes' : 'list';
  });

  const listSource = (listItems ?? (events as unknown as L[]));

  const sortedListItems = useMemo(
    () => sortTimelineEventsChronologically(listSource.map((i) => ({ ...i, eventDate: i.date ?? '' })), 'asc'),
    [listSource],
  );

  const sortedEvents = useMemo(
    () => sortTimelineEventsChronologically(events.map((e) => ({ ...e, eventDate: e.date ?? '' })), 'asc'),
    [events],
  );

  const laneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lane of lanes) counts.set(lane.key, 0);
    for (const e of events) counts.set(e.laneKey, (counts.get(e.laneKey) ?? 0) + 1);
    return counts;
  }, [lanes, events]);

  const defaultFooter =
    footer === undefined ? (
      <div className="flex items-center gap-4 text-xs text-white/40 pt-1 flex-wrap">
        {lanes.map((lane) => (
          <span key={lane.key}>
            <span className="text-white/70 font-medium">{laneCounts.get(lane.key) ?? 0}</span> {lane.label}
          </span>
        ))}
        {sortedEvents.length > 0 && sortedEvents[0].date && sortedEvents[sortedEvents.length - 1].date && (
          <span className="text-white/30">
            {fmtEventDate(sortedEvents[0].date)} → {fmtEventDate(sortedEvents[sortedEvents.length - 1].date)}
          </span>
        )}
      </div>
    ) : footer;

  return (
    <div className="space-y-4 min-w-0 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <Icon className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          {badge && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-white/15 text-white/65 bg-white/[0.03]"
                title={badge.hint}
                data-testid={badge.testId}
              >
                {badge.label}
              </Badge>
              {badge.hint && <span className="text-[11px] text-white/35">{badge.hint}</span>}
            </div>
          )}
          {subtitle && <p className="text-xs text-white/45 mt-1.5">{subtitle}</p>}
        </div>
        <div className="flex rounded-lg border border-white/10 overflow-hidden self-start shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('swimlanes')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition touch-manipulation',
              viewMode === 'swimlanes' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70',
            )}
          >
            <Waves className="h-3.5 w-3.5" />
            <span className="sm:hidden">Lanes</span>
            <span className="hidden sm:inline">Swimlanes</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs border-l border-white/10 transition touch-manipulation',
              viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70',
            )}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      <div className="min-w-0 w-full max-w-full overflow-x-hidden">
      {viewMode === 'list' ? (
        loading ? (
          <div className="h-48 flex items-center justify-center text-white/50 text-sm" data-testid="entity-timeline-loading">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading timeline…
          </div>
        ) : sortedListItems.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Clock className="h-8 w-8 text-white/20" />
            <p className="text-white/60 font-medium">{emptyTitle}</p>
            <p className="text-white/30 text-sm max-w-sm">{emptyHint}</p>
          </div>
        ) : (
          <ol className="relative border-l border-white/10 ml-3 space-y-0 min-w-0">
            {sortedListItems.map((item, idx) => (
              <li key={item.id} className="relative pl-6 pb-6 last:pb-0 min-w-0">
                {renderListItem ? (
                  renderListItem(item)
                ) : (
                  <>
                    <span
                      className={cn(
                        'absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80',
                        laneAccentDot(lanes, (item as unknown as E).laneKey),
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => onEventSelect?.(item as unknown as E)}
                      disabled={!onEventSelect}
                      className={cn(
                        'w-full min-w-0 text-left rounded-lg border border-white/10 bg-black/25 p-3 transition-colors',
                        onEventSelect &&
                          'hover:bg-black/40 hover:border-white/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40',
                      )}
                      data-testid="entity-timeline-list-event"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <time className="text-xs font-mono text-primary/80">{fmtEventDate(item.date)}</time>
                        {(item as unknown as E).type && (
                          <Badge variant="outline" className="text-[10px] text-white/50">
                            {(item as unknown as E).type}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-white break-words">{(item as unknown as E).title}</h4>
                      {(item as unknown as E).summary && (
                        <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-4 sm:line-clamp-none break-words">
                          {(item as unknown as E).summary}
                        </p>
                      )}
                      {(item as unknown as E).meta && (
                        <p className="text-[10px] text-white/40 mt-2 break-words">{(item as unknown as E).meta}</p>
                      )}
                    </button>
                  </>
                )}
                {idx < sortedListItems.length - 1 && <span className="sr-only">then</span>}
              </li>
            ))}
          </ol>
        )
      ) : (
        <EventTimelineSwimlanes
          loading={loading}
          lanes={lanes}
          events={events}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
          onEventSelect={
            onEventSelect
              ? (swim) => {
                  const full = events.find((e) => e.id === swim.id);
                  if (full) onEventSelect(full);
                }
              : undefined
          }
        />
      )}
      </div>

      {defaultFooter}
    </div>
  );
}

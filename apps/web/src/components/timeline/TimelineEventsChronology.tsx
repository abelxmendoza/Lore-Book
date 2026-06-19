/**
 * Chronological event list — grouped by date, newest groups at bottom (story order)
 * or reversed for "latest first" compact strip.
 */

import { Calendar, ChevronRight, Clock } from 'lucide-react';
import type { ChronologyEntry } from '../../types/timelineV2';
import {
  formatEventDateShort,
  formatEventTime,
  groupEntriesByDate,
  sortEntriesChronologically,
  sortEntriesNewestFirst,
} from './timelineEventUtils';
import { TimelineDateHeader, TimelineInlineDate } from './TimelineDateDisplay';

type TimelineEventsChronologyProps = {
  entries: ChronologyEntry[];
  loading?: boolean;
  selectedEntryId?: string | null;
  onSelectEntry: (entry: ChronologyEntry) => void;
  /** compact = horizontal strip under swimlanes; full = dedicated Events tab */
  variant?: 'full' | 'compact';
  order?: 'oldest-first' | 'newest-first';
};

export function TimelineEventCard({
  entry,
  selected,
  onClick,
  showTime = true,
}: {
  entry: ChronologyEntry;
  selected?: boolean;
  onClick: () => void;
  showTime?: boolean;
}) {
  const time = showTime ? formatEventTime(entry.start_time) : null;
  const preview = entry.content.replace(/\s+/g, ' ').trim();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-3.5 py-3 transition-all touch-manipulation ${
        selected
          ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_1px_rgba(var(--primary-rgb,99,102,241),0.25)]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] active:bg-white/[0.08]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {time && (
            <p className="text-[10px] font-mono text-white/35 mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {time}
            </p>
          )}
          <p className="text-sm text-white/85 leading-snug line-clamp-3">{preview}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-white/25 shrink-0 mt-0.5" />
      </div>
    </button>
  );
}

export const TimelineEventsChronology = ({
  entries,
  loading,
  selectedEntryId,
  onSelectEntry,
  variant = 'full',
  order = 'oldest-first',
}: TimelineEventsChronologyProps) => {
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="animate-pulse text-sm text-white/40">Loading events…</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Calendar className="h-10 w-10 text-white/20" />
        <p className="text-white/50 font-medium">No events yet</p>
        <p className="text-white/30 text-sm max-w-xs">
          Chat about your life — memories will appear here in chronological order.
        </p>
      </div>
    );
  }

  const groups =
    order === 'newest-first'
      ? groupEntriesByDate(sortEntriesNewestFirst(entries)).reverse()
      : groupEntriesByDate(entries);

  if (variant === 'compact') {
    const flat =
      order === 'newest-first'
        ? sortEntriesNewestFirst(entries)
        : sortEntriesChronologically(entries);
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 px-1 snap-x snap-mandatory touch-pan-x">
        {flat.map((entry) => (
          <div key={entry.id} className="snap-start shrink-0 w-[min(280px,78vw)]">
            <TimelineInlineDate iso={entry.start_time} size="sm" showTime={false} />
            <div className="mt-1.5">
            <TimelineEventCard
              entry={entry}
              selected={selectedEntryId === entry.id}
              onClick={() => onSelectEntry(entry)}
            />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
      <div className="h-full overflow-y-auto overscroll-contain">
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-8 pb-6 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        {groups.map((group) => (
          <section key={group.dateKey} aria-label={group.label}>
            <TimelineDateHeader
              dateKey={group.dateKey}
              weekday={group.weekday}
              count={group.entries.length}
            />

            <div className="space-y-2 pl-0 sm:pl-2 border-l-2 border-primary/25 ml-1 sm:ml-2">
              {group.entries.map((entry) => (
                <div key={entry.id} className="relative pl-3 sm:pl-4">
                  <span className="absolute -left-[5px] top-4 w-2 h-2 rounded-full bg-primary/70 ring-2 ring-black" />
                  <TimelineEventCard
                    entry={entry}
                    selected={selectedEntryId === entry.id}
                    onClick={() => onSelectEntry(entry)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

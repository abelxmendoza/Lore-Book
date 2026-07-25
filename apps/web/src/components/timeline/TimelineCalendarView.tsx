/**
 * Canonical month calendar — occasions + stitched events/moments by day.
 * Single calendar for the app (Omni Timeline). Life Log links here.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useCalendarMonth } from '../../hooks/useCalendarMonth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { fetchJson } from '../../lib/api';
import type { CalendarDayItem } from '../../api/calendarMonth';
import type { Event } from '../events/EventProfileCard';
import { EventDetailModal } from '../events/EventDetailModal';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import { TimelineStitchedView } from './TimelineStitchedView';
import { TimelineDateHeader, TimelineMonthBanner } from './TimelineDateDisplay';

function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function parseDateParam(raw?: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = parseISO(`${raw}T12:00:00`);
  return Number.isFinite(d.getTime()) ? startOfDay(d) : null;
}

export type TimelineCalendarViewProps = {
  /** YYYY-MM-DD from URL / deep link */
  initialDate?: string | null;
  /** Persist selected day into the parent URL */
  onDateChange?: (dateKey: string) => void;
  /** Jump into Chronology / date search for this day */
  onOpenDayInTimeline?: (dateKey: string) => void;
};

function dayActivityCount(apiDay: { occasions: unknown[]; items: CalendarDayItem[] } | undefined): number {
  if (!apiDay) return 0;
  return apiDay.occasions.length + apiDay.items.filter((i) => i.kind !== 'occasion').length;
}

export const TimelineCalendarView = ({
  initialDate,
  onDateChange,
  onOpenDayInTimeline,
}: TimelineCalendarViewProps) => {
  const isMobile = useIsMobile();
  const { openMemory } = useEntityModal();

  const seeded = useMemo(() => parseDateParam(initialDate) ?? startOfDay(new Date()), [initialDate]);
  const [month, setMonth] = useState(() => startOfMonth(seeded));
  const [selected, setSelected] = useState(() => seeded);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState<{ id: string; title: string } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Follow deep-link date changes (e.g. Life Log → calendar with a day).
  useEffect(() => {
    const next = parseDateParam(initialDate);
    if (!next) return;
    setMonth(startOfMonth(next));
    setSelected(next);
  }, [initialDate]);

  const year = month.getFullYear();
  const monthNum = month.getMonth() + 1;
  const { dayMap, loading, error, reload, isDemoMode } = useCalendarMonth(year, monthNum);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month],
  );

  const selectedDay = dayMap.get(dayKey(selected));
  const selectedCount = dayActivityCount(selectedDay);

  const notifyDate = useCallback(
    (day: Date) => {
      onDateChange?.(dayKey(day));
    },
    [onDateChange],
  );

  const selectDay = useCallback(
    (day: Date) => {
      const next = startOfDay(day);
      if (!isSameMonth(next, month)) {
        setMonth(startOfMonth(next));
      }
      setSelected(next);
      notifyDate(next);
      if (isMobile) setDaySheetOpen(true);
    },
    [isMobile, month, notifyDate],
  );

  const goMonth = useCallback(
    (delta: -1 | 1) => {
      setMonth((m) => {
        const next = startOfMonth(delta < 0 ? subMonths(m, 1) : addMonths(m, 1));
        const today = startOfDay(new Date());
        const nextSelected = isSameMonth(today, next)
          ? today
          : startOfMonth(next);
        setSelected(nextSelected);
        notifyDate(nextSelected);
        return next;
      });
      setDaySheetOpen(false);
    },
    [notifyDate],
  );

  const goToday = useCallback(() => {
    const t = startOfDay(new Date());
    setMonth(startOfMonth(t));
    setSelected(t);
    notifyDate(t);
    if (isMobile) setDaySheetOpen(true);
  }, [isMobile, notifyDate]);

  const syncOccasions = async () => {
    if (isDemoMode) {
      await reload();
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      await fetchJson('/api/chronology/sync-occasions', {
        method: 'POST',
        body: JSON.stringify({ lookback_days: 90 }),
      });
      await reload();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Could not sync occasions');
    } finally {
      setSyncing(false);
    }
  };

  const openDayItem = useCallback(
    async (item: CalendarDayItem) => {
      const sourceId = item.sourceId ?? item.id;
      const isJournal =
        item.kind === 'moment' ||
        item.sourceKind === 'journal_entry' ||
        item.sourceType === 'journal';
      setOpenError(null);
      if (isJournal) {
        openMemory({
          id: sourceId,
          journal_entry_id: sourceId,
          content: item.body || item.title,
          date: item.sortTime,
          title: item.title,
        });
        setDaySheetOpen(false);
        return;
      }

      setOpeningItemId(item.id);
      try {
        const eventId =
          item.sourceKind === 'resolved_event' || item.kind === 'event' ? sourceId : item.id;
        const res = await fetchJson<{ success?: boolean; event?: Event }>(
          `/api/conversation/events/${eventId}`,
        );
        if (res?.event) {
          setSelectedEvent(res.event);
          setDaySheetOpen(false);
        } else {
          setOpenError('Could not load that event. Opening as a memory instead.');
          openMemory({
            id: sourceId,
            content: item.body || item.title,
            date: item.sortTime,
            title: item.title,
          });
          setDaySheetOpen(false);
        }
      } catch {
        setOpenError('Could not load that event. Opening as a memory instead.');
        openMemory({
          id: sourceId,
          content: item.body || item.title,
          date: item.sortTime,
          title: item.title,
        });
        setDaySheetOpen(false);
      } finally {
        setOpeningItemId(null);
      }
    },
    [openMemory],
  );

  const weekdayLabels = isMobile
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dayDetailContent = (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs text-white/40">
          {selectedCount === 0
            ? 'No lore on this day'
            : `${selectedCount} item${selectedCount === 1 ? '' : 's'}`}
        </p>
        {onOpenDayInTimeline && (
          <button
            type="button"
            onClick={() => {
              onOpenDayInTimeline(dayKey(selected));
              setDaySheetOpen(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70 hover:text-white hover:border-primary/40 transition touch-manipulation"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Open in Chronology
          </button>
        )}
      </div>

      {openError && (
        <p className="mb-2 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
          {openError}
        </p>
      )}

      {!selectedDay || selectedCount === 0 ? (
        <p className="text-sm text-white/40 py-2">
          Nothing on this day yet. Chat about what happened and it will show up here.
        </p>
      ) : (
        <div className="space-y-2 pb-2">
          {selectedDay.occasions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setSelectedOccasion({ id: o.id, title: o.title });
                setDaySheetOpen(false);
              }}
              className="w-full text-left rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 active:bg-violet-500/15 touch-manipulation min-h-[44px]"
            >
              <p className="text-xs text-violet-300">
                {o.userPresence === 'heard_about' ? 'Heard about' : 'You were there'}
                {o.itemCount > 0 ? ` · ${o.itemCount} linked` : ''}
              </p>
              <p className="text-sm font-medium text-white mt-0.5">{o.title}</p>
              {o.summary && <p className="text-xs text-white/45 mt-1 line-clamp-2">{o.summary}</p>}
            </button>
          ))}
          {selectedDay.items
            .filter((i) => i.kind !== 'occasion')
            .map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={openingItemId === item.id}
                onClick={() => void openDayItem(item)}
                className="w-full text-left rounded-xl border border-white/8 bg-white/[0.03] p-3 hover:border-primary/35 hover:bg-primary/8 transition touch-manipulation min-h-[44px] disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-white/35 uppercase tracking-wide">{item.kind}</p>
                  {item.userPresence === 'heard_about' && (
                    <span className="text-[10px] text-amber-200/80">Heard about</span>
                  )}
                </div>
                <p className="text-sm text-white/85 mt-0.5">{item.title}</p>
                {item.body && (
                  <p className="text-xs text-white/40 mt-1 line-clamp-2">{item.body}</p>
                )}
                <p className="text-[10px] text-white/30 font-mono mt-0.5">
                  {item.sortTime.slice(11, 16) || '—'}
                </p>
              </button>
            ))}
        </div>
      )}
    </>
  );

  return (
    <div className="timeline-calendar-root h-full flex flex-col min-h-0" data-testid="timeline-calendar-view">
      <div className="flex-shrink-0 px-3 sm:px-5 py-3 border-b border-white/10 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono mb-1">
              Calendar{isDemoMode ? ' · Demo' : ''}
            </p>
            <div className="flex justify-center sm:justify-start">
              <TimelineMonthBanner label={format(month, 'MMMM yyyy')} sublabel="Month view" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => void syncOccasions()}
              disabled={syncing}
              title="Sync occasions from recent lore"
              className="inline-flex items-center justify-center gap-1.5 h-11 min-w-[44px] px-3 rounded-xl border border-white/10 text-white/65 active:bg-white/5 touch-manipulation disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="text-xs hidden xs:inline sm:inline">Sync</span>
            </button>
            <div className="inline-flex items-center rounded-xl border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                aria-label="Previous month"
                className="h-11 w-11 flex items-center justify-center text-white/55 active:bg-white/5 touch-manipulation"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="h-11 px-3 text-xs text-white/70 border-x border-white/10 active:bg-white/5 touch-manipulation"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                aria-label="Next month"
                className="h-11 w-11 flex items-center justify-center text-white/55 active:bg-white/5 touch-manipulation"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {(error || syncError) && (
          <div
            className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
            role="alert"
            data-testid="calendar-error"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{error ?? syncError}</p>
              {error && (
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="mt-1 text-xs underline text-red-100/90"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-4 lg:p-5">
          <div
            className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[10px] sm:text-[11px] uppercase font-bold text-primary/80 mb-2 tracking-wider"
            aria-hidden
          >
            {weekdayLabels.map((d, i) => (
              <div key={`${d}-${i}`} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div
            className="grid grid-cols-7 gap-1 sm:gap-1.5"
            role="grid"
            aria-label={`${format(month, 'MMMM yyyy')} calendar`}
          >
            {days.map((day) => {
              const key = dayKey(day);
              const apiDay = dayMap.get(key);
              const isSelected = isSameDay(day, selected);
              const inMonth = isSameMonth(day, month);
              const today = isToday(day);
              const occasion = apiDay?.occasions[0];
              const itemCount = dayActivityCount(apiDay);
              const nonOccasion = apiDay?.items.filter((i) => i.kind !== 'occasion').length ?? 0;

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={`${format(day, 'EEEE, MMMM d')}${itemCount ? `, ${itemCount} items` : ''}`}
                  onClick={() => selectDay(day)}
                  className={`min-h-[44px] sm:min-h-[4.75rem] rounded-lg sm:rounded-xl border flex flex-col items-stretch justify-start p-1 sm:p-2 touch-manipulation transition ${
                    isSelected
                      ? 'border-primary/70 bg-primary/20 ring-2 ring-primary/45 shadow-[0_0_16px_rgba(99,102,241,0.35)]'
                      : today
                        ? 'border-primary/35 bg-primary/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`text-sm sm:text-base font-bold tabular-nums leading-none ${
                        isSelected || today ? 'text-white' : 'text-white/85'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {itemCount > 0 && (
                      <span className="hidden sm:inline text-[10px] font-mono text-violet-200/90 bg-violet-500/15 border border-violet-400/25 rounded-full px-1.5 py-0.5">
                        {itemCount}
                      </span>
                    )}
                  </div>

                  {loading && inMonth && (
                    <span className="hidden sm:block text-[9px] text-white/25 mt-1">…</span>
                  )}

                  {occasion && (
                    <p className="hidden sm:block text-[10px] text-violet-200 truncate mt-1 leading-tight text-left w-full">
                      {occasion.title}
                    </p>
                  )}
                  {!occasion && nonOccasion > 0 && (
                    <p className="hidden sm:block text-[10px] text-white/45 truncate mt-1 leading-tight text-left w-full">
                      {nonOccasion} memor{nonOccasion === 1 ? 'y' : 'ies'}
                    </p>
                  )}

                  {itemCount > 0 && (
                    <span className="sm:hidden mt-auto pt-1 flex gap-0.5 justify-center">
                      {Array.from({ length: Math.min(itemCount, 3) }).map((_, i) => (
                        <span key={i} className="h-1.5 w-1.5 rounded-full bg-violet-400/90" aria-hidden />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail: side panel on large screens, stacked below on tablet; sheet on phones */}
        {!isMobile ? (
          <div
            className="flex-shrink-0 lg:flex-1 border-t lg:border-t-0 lg:border-l border-white/10 min-h-0 max-h-[42%] lg:max-h-none overflow-y-auto p-3 sm:p-4"
            data-testid="calendar-day-detail"
          >
            <TimelineDateHeader
              dateKey={format(selected, 'yyyy-MM-dd')}
              weekday={format(selected, 'EEEE')}
              sticky={false}
              className="mx-0 mb-3 lg:mb-4 rounded-xl overflow-hidden"
            />
            {dayDetailContent}
          </div>
        ) : (
          <MobileBottomSheet
            open={daySheetOpen}
            onClose={() => setDaySheetOpen(false)}
            title={format(selected, 'EEEE, MMM d')}
          >
            {dayDetailContent}
          </MobileBottomSheet>
        )}
      </div>

      {selectedOccasion && (
        <TimelineStitchedView
          lifeArcId={selectedOccasion.id}
          scopeLabel={selectedOccasion.title}
          onClose={() => setSelectedOccasion(null)}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDeleted={() => {
            setSelectedEvent(null);
            void reload();
          }}
        />
      )}
    </div>
  );
};

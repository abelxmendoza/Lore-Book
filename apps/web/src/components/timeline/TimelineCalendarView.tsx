/**
 * Month calendar for Omni Timeline — occasions + events by day.
 */

import { useState, useMemo } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useCalendarMonth } from '../../hooks/useCalendarMonth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { fetchJson } from '../../lib/api';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import { TimelineStitchedView } from './TimelineStitchedView';
import { TimelineDateHeader, TimelineMonthBanner } from './TimelineDateDisplay';

function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export const TimelineCalendarView = () => {
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState<{ id: string; title: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const year = month.getFullYear();
  const monthNum = month.getMonth() + 1;
  const { dayMap, loading, reload } = useCalendarMonth(year, monthNum);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month]
  );

  const selectedDay = dayMap.get(dayKey(selected));

  const syncOccasions = async () => {
    setSyncing(true);
    try {
      await fetchJson('/api/chronology/sync-occasions', {
        method: 'POST',
        body: JSON.stringify({ lookback_days: 90 }),
      });
      await reload();
    } finally {
      setSyncing(false);
    }
  };

  const selectDay = (day: Date) => {
    setSelected(startOfDay(day));
    if (isMobile) setDaySheetOpen(true);
  };

  const dayDetailContent = (
    <>
      {!selectedDay || (selectedDay.occasions.length === 0 && selectedDay.items.length === 0) ? (
        <p className="text-sm text-white/40 py-2">Nothing on this day yet.</p>
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
              className="w-full text-left rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 active:bg-violet-500/15 touch-manipulation"
            >
              <p className="text-xs text-violet-300">{o.userPresence === 'heard_about' ? 'Heard about' : 'You were there'}</p>
              <p className="text-sm font-medium text-white mt-0.5">{o.title}</p>
            </button>
          ))}
          {selectedDay.items
            .filter((i) => i.kind !== 'occasion')
            .map((item) => (
              <div key={item.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[10px] text-white/35 uppercase">{item.kind}</p>
                <p className="text-sm text-white/85 mt-0.5">{item.title}</p>
                <p className="text-[10px] text-white/30 font-mono mt-0.5">{item.sortTime.slice(11, 16)}</p>
              </div>
            ))}
        </div>
      )}
    </>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono hidden sm:block">Calendar</p>
            <TimelineMonthBanner label={format(month, 'MMMM yyyy')} sublabel="Month view" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void syncOccasions()}
              disabled={syncing}
              title="Sync occasions"
              className="inline-flex items-center justify-center h-10 w-10 sm:w-auto sm:px-3 sm:gap-1.5 rounded-xl border border-white/10 text-white/60 active:bg-white/5"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-xs">Sync occasions</span>
            </button>
            <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month" className="h-10 w-10 rounded-xl border border-white/10 text-white/50 flex items-center justify-center active:bg-white/5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                setMonth(startOfMonth(t));
                selectDay(t);
              }}
              className="h-10 px-3 rounded-xl border border-white/10 text-xs text-white/60 active:bg-white/5"
            >
              Today
            </button>
            <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month" className="h-10 w-10 rounded-xl border border-white/10 text-white/50 flex items-center justify-center active:bg-white/5">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6">
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[9px] sm:text-[10px] uppercase font-bold text-primary/80 mb-1.5 sm:mb-2 tracking-wider">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>
                <span className="sm:hidden">{d.charAt(0)}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {days.map((day) => {
              const key = dayKey(day);
              const apiDay = dayMap.get(key);
              const isSelected = isSameDay(day, selected);
              const inMonth = isSameMonth(day, month);
              const occasion = apiDay?.occasions[0];
              const itemCount = apiDay ? apiDay.occasions.length + apiDay.items.filter((i) => i.kind !== 'occasion').length : 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`aspect-square sm:aspect-auto sm:min-h-[4.5rem] rounded-lg sm:rounded-xl border flex flex-col items-center sm:items-start justify-center sm:justify-start p-0.5 sm:p-2 touch-manipulation ${
                    isSelected
                      ? 'border-primary/70 bg-primary/20 ring-2 ring-primary/45 shadow-[0_0_16px_rgba(99,102,241,0.35)]'
                      : 'border-white/10 bg-white/[0.03]'
                  } ${inMonth ? '' : 'opacity-35'}`}
                >
                  <span
                    className={`text-sm sm:text-base font-bold tabular-nums ${
                      isSelected ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.3)]' : 'text-white/85'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  {loading && inMonth && <span className="hidden sm:block text-[9px] text-white/25 mt-0.5">…</span>}
                  {occasion && (
                    <p className="hidden sm:block text-[10px] text-violet-200 truncate mt-1 leading-tight w-full">{occasion.title}</p>
                  )}
                  {itemCount > 0 && (
                    <span className="sm:hidden mt-0.5 flex gap-0.5">
                      {Array.from({ length: Math.min(itemCount, 3) }).map((_, i) => (
                        <span key={i} className="h-1 w-1 rounded-full bg-violet-400/80" aria-hidden />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop side panel */}
        <div className="hidden lg:block border-l border-white/10 overflow-y-auto p-4">
          <TimelineDateHeader dateKey={format(selected, 'yyyy-MM-dd')} weekday={format(selected, 'EEEE')} sticky={false} className="mx-0 mb-4 rounded-xl overflow-hidden" />
          {dayDetailContent}
        </div>
      </div>

      {/* Mobile day detail sheet */}
      <MobileBottomSheet
        open={isMobile && daySheetOpen}
        onClose={() => setDaySheetOpen(false)}
        title={format(selected, 'EEEE, MMM d')}
      >
        {dayDetailContent}
      </MobileBottomSheet>

      {selectedOccasion && (
        <TimelineStitchedView
          lifeArcId={selectedOccasion.id}
          scopeLabel={selectedOccasion.title}
          onClose={() => setSelectedOccasion(null)}
        />
      )}
    </div>
  );
};

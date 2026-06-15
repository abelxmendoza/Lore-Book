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
import { fetchJson } from '../../lib/api';
import { TimelineStitchedView } from './TimelineStitchedView';

function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export const TimelineCalendarView = () => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
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

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-white/10">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Calendar</p>
          <h2 className="text-lg font-semibold text-white">{format(month, 'MMMM yyyy')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void syncOccasions()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs text-white/60 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync occasions
          </button>
          <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))} className="p-2 rounded-lg border border-white/10 text-white/50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              setMonth(startOfMonth(t));
              setSelected(startOfDay(t));
            }}
            className="px-3 py-2 rounded-lg border border-white/10 text-xs text-white/60"
          >
            Today
          </button>
          <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="p-2 rounded-lg border border-white/10 text-white/50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] overflow-hidden">
        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase text-white/35 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const key = dayKey(day);
              const apiDay = dayMap.get(key);
              const isSelected = isSameDay(day, selected);
              const inMonth = isSameMonth(day, month);
              const occasion = apiDay?.occasions[0];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(startOfDay(day))}
                  className={`min-h-[4.5rem] rounded-xl border p-2 text-left ${
                    isSelected ? 'border-primary/60 bg-primary/10' : 'border-white/8 bg-white/[0.03]'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span className="text-xs font-semibold text-white/80">{format(day, 'd')}</span>
                  {loading && inMonth && <span className="block text-[9px] text-white/25 mt-1">…</span>}
                  {occasion && (
                    <p className="text-[10px] text-violet-200 truncate mt-1 leading-tight">{occasion.title}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto p-4">
          <p className="text-sm font-semibold text-white mb-3">{format(selected, 'EEEE, MMM d')}</p>
          {!selectedDay || (selectedDay.occasions.length === 0 && selectedDay.items.length === 0) ? (
            <p className="text-sm text-white/40">Nothing on this day yet.</p>
          ) : (
            <div className="space-y-2">
              {selectedDay.occasions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOccasion({ id: o.id, title: o.title })}
                  className="w-full text-left rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 hover:bg-violet-500/15"
                >
                  <p className="text-xs text-violet-300">{o.userPresence === 'heard_about' ? 'Heard about' : 'You were there'}</p>
                  <p className="text-sm font-medium text-white mt-0.5">{o.title}</p>
                </button>
              ))}
              {selectedDay.items
                .filter((i) => i.kind !== 'occasion')
                .map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                    <p className="text-[10px] text-white/35 uppercase">{item.kind}</p>
                    <p className="text-xs text-white/80 mt-0.5">{item.title}</p>
                    <p className="text-[10px] text-white/30 font-mono mt-0.5">{item.sortTime.slice(11, 16)}</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

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

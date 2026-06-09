import { useState, useEffect } from 'react';
import { CalendarDays, TrendingUp, Flame } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

// Generate a stable demo pattern relative to today
function generateMockDays(): DayData[] {
  const pattern = [2, 0, 1, 3, 1, 2, 0, 1, 1, 4, 2, 0, 1, 3, 2, 1, 0, 2, 1, 0, 3, 2, 1, 1, 0, 2, 5];
  const today = new Date();
  const days: DayData[] = [];
  for (let i = 104; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const count = pattern[i % pattern.length];
    if (count > 0) days.push({ date: d.toISOString().slice(0, 10), count });
  }
  return days;
}
const MOCK_DAYS = generateMockDays();
const MOCK_CALENDAR: CalendarData = {
  days: MOCK_DAYS,
  totalEntries: 127,
  currentStreak: 8,
  longestStreak: 21,
  activeDays: MOCK_DAYS.length,
};

interface DayData {
  date: string; // YYYY-MM-DD
  count: number;
}

interface CalendarData {
  days: DayData[];
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
}

const INTENSITY_CLASSES = [
  'bg-white/5 border-white/5',
  'bg-emerald-900/60 border-emerald-800/40',
  'bg-emerald-700/70 border-emerald-600/40',
  'bg-emerald-500/80 border-emerald-400/50',
  'bg-emerald-400 border-emerald-300/60',
];

function getIntensity(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function buildCalendarWeeks(days: DayData[]): (DayData | null)[][] {
  const map = new Map(days.map(d => [d.date, d.count]));

  const today = new Date();
  // Go back 15 weeks from today (Sunday-aligned)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (15 * 7) - startDate.getDay());

  const weeks: (DayData | null)[][] = [];
  let current = new Date(startDate);

  while (current <= today) {
    const week: (DayData | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (current > today) {
        week.push(null);
      } else {
        const key = current.toISOString().slice(0, 10);
        week.push({ date: key, count: map.get(key) ?? 0 });
      }
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface HeatmapProps {
  days: DayData[];
}

const Heatmap = ({ days }: HeatmapProps) => {
  const [tooltip, setTooltip] = useState<{ date: string; count: number } | null>(null);
  const weeks = buildCalendarWeeks(days);

  // Derive month label positions
  const monthPositions: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const firstRealDay = week.find(d => d !== null);
    if (firstRealDay) {
      const m = new Date(firstRealDay.date + 'T12:00:00').getMonth();
      if (m !== lastMonth) {
        monthPositions.push({ label: MONTH_LABELS[m], col });
        lastMonth = m;
      }
    }
  });

  return (
    <div className="overflow-x-auto pb-2">
      <div className="inline-flex flex-col gap-0.5 min-w-0">
        {/* Month labels */}
        <div className="flex gap-0.5 mb-1 ml-6">
          {weeks.map((_, col) => {
            const pos = monthPositions.find(p => p.col === col);
            return (
              <div key={col} className="w-3 text-[9px] text-white/30 leading-none">
                {pos ? pos.label : ''}
              </div>
            );
          })}
        </div>

        {/* Grid rows (day of week) */}
        {[0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => (
          <div key={dayOfWeek} className="flex items-center gap-0.5">
            <span className="w-5 text-[9px] text-white/30 text-right pr-1 leading-none">
              {dayOfWeek % 2 === 1 ? DAY_LABELS[dayOfWeek] : ''}
            </span>
            {weeks.map((week, col) => {
              const cell = week[dayOfWeek];
              if (!cell) {
                return <div key={col} className="w-3 h-3 rounded-sm" />;
              }
              const intensity = getIntensity(cell.count);
              return (
                <div
                  key={col}
                  className={`w-3 h-3 rounded-sm border cursor-default transition-opacity hover:opacity-80 ${INTENSITY_CLASSES[intensity]}`}
                  onMouseEnter={() => setTooltip(cell)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="mt-3 text-xs text-white/60 text-center">
          {tooltip.count === 0
            ? `${formatDate(tooltip.date)} — no entries`
            : `${formatDate(tooltip.date)} — ${tooltip.count} ${tooltip.count === 1 ? 'entry' : 'entries'}`
          }
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-[10px] text-white/30">Less</span>
        {INTENSITY_CLASSES.map((cls, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm border ${cls}`} />
        ))}
        <span className="text-[10px] text-white/30">More</span>
      </div>
    </div>
  );
};

function computeStreaks(days: DayData[]): { current: number; longest: number } {
  const active = new Set(days.filter(d => d.count > 0).map(d => d.date));
  const today = new Date().toISOString().slice(0, 10);

  let current = 0;
  let check = new Date();
  while (active.has(check.toISOString().slice(0, 10))) {
    current++;
    check.setDate(check.getDate() - 1);
  }

  // Sort dates descending to find longest
  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of sorted) {
    const dt = new Date(d + 'T12:00:00');
    if (prev) {
      const diff = (dt.getTime() - prev.getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = dt;
  }

  return { current, longest };
}

export const ActivityCalendarPanel = () => {
  const isMockData = useShouldUseMockData();
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [isMockData]);

  const load = async () => {
    if (isMockData) {
      setData(MOCK_CALENDAR);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch recent entries — just need dates
      const result = await fetchJson<{ success: boolean; entries?: Array<{ created_at: string }> }>(
        '/api/entries?limit=500'
      );
      const entries = result.entries ?? [];

      // Count by day
      const counts = new Map<string, number>();
      for (const e of entries) {
        const day = e.created_at.slice(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }

      const days: DayData[] = Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
      const { current, longest } = computeStreaks(days);

      setData({
        days,
        totalEntries: entries.length,
        currentStreak: current,
        longestStreak: longest,
        activeDays: days.length,
      });
    } catch {
      // Show empty state on error
      setData({ days: [], totalEntries: 0, currentStreak: 0, longestStreak: 0, activeDays: 0 });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
        <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
      </div>
    );
  }

  const d = data!;
  const isEmpty = d.totalEntries === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-emerald-400" />
          Activity Calendar
        </h2>
        <p className="text-sm text-white/50 mt-1">
          Your journaling activity over the past 15 weeks.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="text-xs text-white/50">Current Streak</span>
          </div>
          <div className="text-2xl font-bold text-white">{d.currentStreak}</div>
          <div className="text-xs text-white/40">days</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-white/50">Longest Streak</span>
          </div>
          <div className="text-2xl font-bold text-white">{d.longestStreak}</div>
          <div className="text-xs text-white/40">days</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-xs text-white/50 mb-1">Total Entries</div>
          <div className="text-2xl font-bold text-white">{d.totalEntries}</div>
          <div className="text-xs text-white/40">all time</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-xs text-white/50 mb-1">Active Days</div>
          <div className="text-2xl font-bold text-white">{d.activeDays}</div>
          <div className="text-xs text-white/40">days journaled</div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white/3 border border-white/10 rounded-xl p-4 sm:p-6">
        {isEmpty ? (
          <div className="text-center py-8">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-white/20" />
            <p className="text-white/40 text-sm">No journal entries yet.</p>
            <p className="text-white/30 text-xs mt-1">Start chatting and your activity will appear here.</p>
          </div>
        ) : (
          <Heatmap days={d.days} />
        )}
      </div>
    </div>
  );
};

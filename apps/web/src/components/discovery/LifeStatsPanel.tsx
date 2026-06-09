import { useState, useEffect } from 'react';
import { BarChart3, MessageSquare, Brain, Users, Calendar, Clock, Hash } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

const _firstEntryDate = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 8);
  return d.toISOString().slice(0, 10);
})();

const MOCK_STATS: Stats = {
  totalEntries: 312,
  totalUserEntries: 189,
  estimatedWords: 47823,
  avgWordsPerEntry: 253,
  avgEntriesPerWeek: 8.4,
  mostActiveDayOfWeek: 'Wednesday',
  mostActiveHour: 22,
  totalEntities: 34,
  weeklyBreakdown: [8, 12, 27, 34, 29, 21, 11],
  hourlyBreakdown: [1, 0, 0, 0, 0, 1, 2, 3, 5, 4, 6, 8, 7, 5, 6, 9, 11, 14, 18, 22, 19, 15, 12, 8],
  firstEntryDate: _firstEntryDate,
  daysSinceFirst: 245,
};

interface EntryRecord {
  created_at: string;
  content?: string;
  role?: string;
}

interface Stats {
  totalEntries: number;
  totalUserEntries: number;
  estimatedWords: number;
  avgWordsPerEntry: number;
  avgEntriesPerWeek: number;
  mostActiveDayOfWeek: string;
  mostActiveHour: number;
  totalEntities: number;
  weeklyBreakdown: number[]; // [Sun..Sat] counts
  hourlyBreakdown: number[]; // [0..23] counts
  firstEntryDate: string | null;
  daysSinceFirst: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function computeStats(entries: EntryRecord[], entityCount: number): Stats {
  const userEntries = entries.filter(e => !e.role || e.role === 'user');
  const totalEntries = entries.length;
  const totalUserEntries = userEntries.length;

  const estimatedWords = userEntries.reduce((sum, e) => {
    return sum + (e.content ? e.content.trim().split(/\s+/).length : 0);
  }, 0);
  const avgWordsPerEntry = totalUserEntries > 0 ? Math.round(estimatedWords / totalUserEntries) : 0;

  const weeklyBreakdown = new Array(7).fill(0) as number[];
  const hourlyBreakdown = new Array(24).fill(0) as number[];
  let firstDate: Date | null = null;

  for (const e of userEntries) {
    const d = new Date(e.created_at);
    weeklyBreakdown[d.getDay()]++;
    hourlyBreakdown[d.getHours()]++;
    if (!firstDate || d < firstDate) firstDate = d;
  }

  const daysSinceFirst = firstDate
    ? Math.floor((Date.now() - firstDate.getTime()) / 86400000)
    : 0;
  const weeksActive = Math.max(daysSinceFirst / 7, 1);
  const avgEntriesPerWeek = Math.round((totalUserEntries / weeksActive) * 10) / 10;

  const maxDayIdx = weeklyBreakdown.indexOf(Math.max(...weeklyBreakdown));
  const maxHourIdx = hourlyBreakdown.indexOf(Math.max(...hourlyBreakdown));

  return {
    totalEntries,
    totalUserEntries,
    estimatedWords,
    avgWordsPerEntry,
    avgEntriesPerWeek,
    mostActiveDayOfWeek: DAY_FULL[maxDayIdx] ?? 'N/A',
    mostActiveHour: maxHourIdx,
    totalEntities: entityCount,
    weeklyBreakdown,
    hourlyBreakdown,
    firstEntryDate: firstDate ? firstDate.toISOString().slice(0, 10) : null,
    daysSinceFirst,
  };
}

interface MiniBarProps {
  values: number[];
  labels: string[];
  highlightIndex: number;
  color: string;
}

const MiniBar = ({ values, labels, highlightIndex, color }: MiniBarProps) => {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className={`w-full rounded-sm transition-all ${i === highlightIndex ? color : 'bg-white/10'}`}
            style={{ height: `${Math.round((v / max) * 40)}px`, minHeight: v > 0 ? '2px' : '0' }}
            title={`${labels[i]}: ${v}`}
          />
          {labels.length <= 7 && (
            <span className={`text-[8px] leading-none ${i === highlightIndex ? 'text-white/70' : 'text-white/25'}`}>
              {labels[i]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

const StatCard = ({ icon: Icon, label, value, sub, accent = 'text-violet-400' }: StatCardProps) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`h-4 w-4 ${accent}`} />
      <span className="text-xs text-white/50">{label}</span>
    </div>
    <div className="text-2xl font-bold text-white leading-none">{value}</div>
    {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
  </div>
);

export const LifeStatsPanel = () => {
  const isMockData = useShouldUseMockData();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [isMockData]);

  const load = async () => {
    if (isMockData) {
      setStats(MOCK_STATS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [entriesRes, entitiesRes] = await Promise.allSettled([
        fetchJson<{ success?: boolean; entries?: EntryRecord[] }>('/api/entries?limit=1000'),
        fetchJson<{ success?: boolean; entities?: unknown[] }>('/api/omega-memory/entities?limit=1'),
      ]);

      const entries = entriesRes.status === 'fulfilled'
        ? (entriesRes.value.entries ?? [])
        : [];

      const entityCount = entitiesRes.status === 'fulfilled'
        ? (entitiesRes.value.entities?.length ?? 0)
        : 0;

      setStats(computeStats(entries, entityCount));
    } catch {
      setStats(computeStats([], 0));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-white/5 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = stats!;
  const isEmpty = s.totalEntries === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-violet-400" />
          Life Stats
        </h2>
        <p className="text-sm text-white/50 mt-1">
          A numbers view of your journaling life.
          {s.firstEntryDate && (
            <> Tracking since <span className="text-white/70">{new Date(s.firstEntryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span> ({s.daysSinceFirst} days).</>
          )}
        </p>
      </div>

      {isEmpty ? (
        <div className="text-center py-16 border border-border/40 rounded-xl bg-black/20">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-white/40">No data yet — start chatting to see your stats.</p>
        </div>
      ) : (
        <>
          {/* Core stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={MessageSquare}
              label="Journal Entries"
              value={s.totalUserEntries.toLocaleString()}
              sub="messages from you"
              accent="text-violet-400"
            />
            <StatCard
              icon={Hash}
              label="Words Written"
              value={s.estimatedWords > 1000
                ? `${(s.estimatedWords / 1000).toFixed(1)}k`
                : s.estimatedWords.toLocaleString()}
              sub={`~${s.avgWordsPerEntry} per entry`}
              accent="text-blue-400"
            />
            <StatCard
              icon={Calendar}
              label="Avg / Week"
              value={s.avgEntriesPerWeek}
              sub="entries per week"
              accent="text-emerald-400"
            />
            <StatCard
              icon={Brain}
              label="Memories Stored"
              value={s.totalEntities}
              sub="entities tracked"
              accent="text-pink-400"
            />
            <StatCard
              icon={Clock}
              label="Peak Hour"
              value={formatHour(s.mostActiveHour)}
              sub="when you journal most"
              accent="text-amber-400"
            />
            <StatCard
              icon={Users}
              label="Best Day"
              value={s.mostActiveDayOfWeek.slice(0, 3)}
              sub={`${s.mostActiveDayOfWeek}s`}
              accent="text-cyan-400"
            />
          </div>

          {/* Weekly pattern */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Entries by Day of Week</h3>
            <MiniBar
              values={s.weeklyBreakdown}
              labels={DAY_NAMES}
              highlightIndex={DAY_NAMES.indexOf(s.mostActiveDayOfWeek.slice(0, 3))}
              color="bg-violet-500"
            />
          </div>

          {/* Hourly pattern */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Entries by Hour of Day</h3>
            <MiniBar
              values={s.hourlyBreakdown}
              labels={s.hourlyBreakdown.map((_, i) => i % 6 === 0 ? formatHour(i) : '')}
              highlightIndex={s.mostActiveHour}
              color="bg-amber-500"
            />
            <div className="flex justify-between text-[10px] text-white/30 mt-1">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

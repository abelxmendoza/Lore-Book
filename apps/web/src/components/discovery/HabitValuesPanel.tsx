import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Flame, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface Habit {
  id?: string;
  action: string;
  trigger?: string;
  frequency?: number;
  streak?: number;
  longest_streak?: number;
  decay_risk?: number;
  category?: string;
  last_performed?: string;
}

interface ValueSignal {
  id?: string;
  timestamp: string;
  category: string;
  strength: number;
  text: string;
}

const DecayBar = ({ risk }: { risk: number }) => {
  const pct = Math.round(risk * 100);
  const color = pct >= 70 ? 'bg-red-500/70' : pct >= 40 ? 'bg-amber-500/60' : 'bg-emerald-500/50';
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="h-1 w-16 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-white/35">{pct}% decay risk</span>
    </div>
  );
};

const StrengthDot = ({ strength }: { strength: number }) => {
  const pct = Math.round(strength * 100);
  const color = pct >= 70 ? 'bg-purple-400' : pct >= 40 ? 'bg-cyan-400' : 'bg-white/30';
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[10px] text-white/40">{pct}%</span>
    </div>
  );
};

export const HabitValuesPanel = () => {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [signals, setSignals] = useState<ValueSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'habits' | 'values'>('habits');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [habitsRes, signalsRes] = await Promise.all([
        fetchJson<{ habits: Habit[] }>('/api/habits'),
        fetchJson<{ signals: ValueSignal[] }>('/api/values/signals'),
      ]);
      setHabits(habitsRes.habits || []);
      setSignals(signalsRes.signals || []);
    } catch {
      // leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Aggregate value signals by category
  const valuesByCategory = signals.reduce<Record<string, { strength: number; count: number; latest: string }>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = { strength: 0, count: 0, latest: s.timestamp };
    acc[s.category].strength = Math.max(acc[s.category].strength, s.strength);
    acc[s.category].count += 1;
    if (s.timestamp > acc[s.category].latest) acc[s.category].latest = s.timestamp;
    return acc;
  }, {});

  const topValues = Object.entries(valuesByCategory)
    .sort(([, a], [, b]) => b.strength - a.strength)
    .slice(0, 12);

  const habitsAtRisk = habits.filter(h => (h.decay_risk ?? 0) >= 0.5);
  const healthyHabits = habits.filter(h => (h.decay_risk ?? 0) < 0.5);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/40 py-8 justify-center">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading habits & values…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setTab('habits')}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            tab === 'habits' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          <Flame className="h-3 w-3 inline mr-1" />
          Habits {habits.length > 0 && <span className="ml-1 text-white/30">({habits.length})</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('values')}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            tab === 'values' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          <Sparkles className="h-3 w-3 inline mr-1" />
          Values {topValues.length > 0 && <span className="ml-1 text-white/30">({topValues.length})</span>}
        </button>
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto h-6 px-2 text-xs text-white/30 hover:text-white/60">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Habits tab */}
      {tab === 'habits' && (
        <div className="space-y-2">
          {habits.length === 0 ? (
            <div className="py-8 text-center text-white/30 text-sm">
              No habits detected yet. Keep journaling — patterns will emerge.
            </div>
          ) : (
            <>
              {habitsAtRisk.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wide text-amber-400/70 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> At risk of fading
                  </p>
                  <div className="space-y-1.5">
                    {habitsAtRisk.map((h, i) => (
                      <HabitRow key={h.id ?? i} habit={h} />
                    ))}
                  </div>
                </div>
              )}
              {healthyHabits.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/30 mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Active habits
                  </p>
                  <div className="space-y-1.5">
                    {healthyHabits.map((h, i) => (
                      <HabitRow key={h.id ?? i} habit={h} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Values tab */}
      {tab === 'values' && (
        <div>
          {topValues.length === 0 ? (
            <div className="py-8 text-center text-white/30 text-sm">
              No value signals detected yet. Your values emerge from what you write about.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {topValues.map(([category, data]) => (
                <div key={category} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-xs text-white/80 capitalize font-medium">{category}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-white/15 text-white/40">
                      ×{data.count}
                    </Badge>
                  </div>
                  <StrengthDot strength={data.strength} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const HabitRow = ({ habit }: { habit: Habit }) => (
  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/80 leading-snug truncate">{habit.action}</p>
        {habit.category && (
          <span className="text-[10px] text-white/35 capitalize">{habit.category}</span>
        )}
        {habit.decay_risk !== undefined && <DecayBar risk={habit.decay_risk} />}
      </div>
      {habit.streak !== undefined && habit.streak > 0 && (
        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-0.5 text-amber-400">
            <Flame className="h-3 w-3" />
            <span className="text-xs font-semibold">{habit.streak}</span>
          </div>
          <span className="text-[9px] text-white/30">streak</span>
        </div>
      )}
    </div>
  </div>
);

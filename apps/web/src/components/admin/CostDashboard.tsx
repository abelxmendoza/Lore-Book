import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';
import { config } from '../../config/env';
import { DollarSign, AlertTriangle, Layers, Cpu } from 'lucide-react';

type CostSummary = {
  rangeDays: number;
  since: string;
  totalUsd: number;
  totalCalls: number;
  byOperation: Array<{ operation: string; usd: number; calls: number; pctOfTotal: number }>;
  byModel: Array<{ model: string; usd: number; calls: number }>;
  byDay: Array<{ day: string; usd: number; calls: number }>;
  budget?: {
    enabled: boolean;
    monthlyLimitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    percentUsed: number;
  } | null;
  derived?: { chatUsd: number; avgUsdPerDay: number };
};

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export const CostDashboard = () => {
  const [data, setData] = useState<CostSummary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchJson<CostSummary>(
          `/api/admin/cost?days=${days}`,
          undefined,
          { timeoutMs: config.api.adminTimeout },
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cost');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) {
    return <div className="text-white/60">Loading AI cost…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-yellow-400 flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4" />
        {error}
      </div>
    );
  }
  if (!data) return null;

  // Defensive defaults: tolerate a partial/legacy API response without crashing.
  const byOperation = data.byOperation ?? [];
  const byModel = data.byModel ?? [];
  const byDay = data.byDay ?? [];
  const maxOpUsd = Math.max(...byOperation.map((o) => o.usd), 0.000001);
  const maxDayUsd = Math.max(...byDay.map((d) => d.usd), 0.000001);

  return (
    <div className="space-y-6" data-testid="ai-cost-dashboard">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">
          Whole-app OpenAI spend since {data.since}. Estimated from token usage.
        </p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md bg-white/[0.04] border border-white/10 px-2 py-1 text-sm text-white/80"
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<DollarSign className="h-4 w-4" />} label="Total (range)" value={usd(data.totalUsd)} />
        <Stat label="Avg / day" value={usd(data.derived?.avgUsdPerDay ?? 0)} />
        <Stat label="Chat spend" value={usd(data.derived?.chatUsd ?? 0)} />
        <Stat label="Total calls" value={data.totalCalls.toLocaleString()} />
      </div>

      {data.budget?.enabled && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Monthly budget</span>
            <span className="text-white/80">
              {usd(data.budget.spentUsd)} / {usd(data.budget.monthlyLimitUsd)} ({data.budget.percentUsed}%)
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full ${data.budget.percentUsed > 90 ? 'bg-red-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, data.budget.percentUsed)}%` }}
            />
          </div>
        </div>
      )}

      {/* WHERE: by operation */}
      <Section title="Where the money goes" icon={<Layers className="h-4 w-4" />}>
        {byOperation.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {byOperation.map((o) => (
              <div key={o.operation} className="flex items-center gap-3 text-sm">
                <div className="w-32 shrink-0 truncate text-white/70" title={o.operation}>
                  {o.operation}
                </div>
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-primary/60" style={{ width: `${(o.usd / maxOpUsd) * 100}%` }} />
                </div>
                <div className="w-20 text-right text-white/80">{usd(o.usd)}</div>
                <div className="w-12 text-right text-white/40">{o.pctOfTotal}%</div>
                <div className="w-20 text-right text-white/40">{o.calls.toLocaleString()} calls</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* WHAT: by model */}
      <Section title="By model" icon={<Cpu className="h-4 w-4" />}>
        {byModel.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-1.5">
            {byModel.map((m) => (
              <div key={m.model} className="flex items-center justify-between text-sm">
                <span className="text-white/70">{m.model}</span>
                <span className="text-white/80">
                  {usd(m.usd)} <span className="text-white/40">· {m.calls.toLocaleString()} calls</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* TREND: by day */}
      <Section title="Daily trend">
        {byDay.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex items-end gap-1 h-24">
            {byDay.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end" title={`${d.day}: ${usd(d.usd)}`}>
                <div
                  className="w-full bg-primary/50 rounded-t"
                  style={{ height: `${Math.max(2, (d.usd / maxDayUsd) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-xs text-white/50">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-white/80">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-white/40">No cost recorded yet for this range.</div>;
}

import { AlertTriangle, Flame, GitBranch, RefreshCw, Shield, Sparkles } from 'lucide-react';

import { useContinuity } from '../hooks/useContinuity';
import { Button } from './ui/button';

const Meter = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${pct}%` }} />
    </div>
  );
};

export const ContinuityPanel = () => {
  const { state, conflicts, report, loading, error, refresh } = useContinuity();
  const facts = state?.registry.facts ?? [];
  const driftSummary = state?.driftSummary ?? {};
  const driftSignals = state?.driftSignals ?? [];
  const score = state?.score ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-indigo-950 p-4 shadow-[0_0_30px_rgba(79,70,229,0.25)]">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-200">Continuity Engine</p>
          <h2 className="text-xl font-semibold text-white">Omega Canon Keeper</h2>
          <p className="text-sm text-white/60">Never contradict yourself. Stabilize lore. Enforce canon.</p>
        </div>
        <Button variant="secondary" onClick={() => refresh()} disabled={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center gap-2 text-indigo-200">
              <Shield className="h-4 w-4" />
              <p className="text-sm uppercase tracking-wide">Canonical Facts</p>
            </div>
            <div className="mt-3 space-y-3">
              {facts.map((fact) => (
                <div key={`${fact.subject}-${fact.attribute}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-slate-400">{fact.subject}</p>
                      <p className="text-lg font-semibold text-white">{fact.attribute}</p>
                      <p className="text-sm text-slate-200">{Array.isArray(fact.value) ? fact.value.join(', ') : fact.value}</p>
                    </div>
                    <div className="text-right text-xs text-slate-300">
                      <p className="mb-1 text-emerald-300">Confidence {Math.round(fact.confidence * 100)}%</p>
                      <Meter value={fact.confidence} />
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-indigo-200">{fact.scope}</p>
                      {fact.permanent && <p className="text-[10px] text-amber-300">Permanent</p>}
                    </div>
                  </div>
                </div>
              ))}
              {!facts.length && <p className="text-sm text-slate-400">No canonical facts yet.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center gap-2 text-indigo-200">
              <GitBranch className="h-4 w-4" />
              <p className="text-sm uppercase tracking-wide">Drift Graph</p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {Object.entries(driftSummary).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex items-center justify-between text-sm text-white">
                    <span className="uppercase tracking-wide text-slate-300">{label}</span>
                    <span className="text-emerald-300">{Math.round(value * 100)}% stable</span>
                  </div>
                  <Meter value={value} />
                </div>
              ))}
              {!Object.keys(driftSummary).length && <p className="text-sm text-slate-400">No drift data yet.</p>}
            </div>

            <div className="mt-4 space-y-2">
              {driftSignals.map((signal) => (
                <div key={`${signal.subject}-${signal.attribute}`} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between text-sm text-white">
                    <div>
                      <p className="text-xs uppercase text-slate-400">{signal.subject}</p>
                      <p className="font-semibold">{signal.attribute}</p>
                    </div>
                    <div className="text-right text-xs text-amber-300">Drift {Math.round(signal.drift_score * 100)}%</div>
                  </div>
                  <p className="text-sm text-slate-200">{signal.notes}</p>
                  {signal.segments?.length ? (
                    <p className="text-[11px] text-slate-400">Segments: {signal.segments.join(' → ')}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm uppercase tracking-wide">Conflict List</p>
              </div>
              <div className="text-right text-xs text-slate-300">Continuity score: {Math.round(score)}</div>
            </div>
            <div className="mt-3 space-y-3">
              {conflicts.map((conflict) => (
                <div key={conflict.description} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase text-slate-400">{conflict.conflict_type}</p>
                      <p className="text-sm text-white">{conflict.description}</p>
                      <p className="text-[11px] text-slate-400">Subjects: {conflict.subjects.join(', ')}</p>
                    </div>
                    <span className="rounded-full bg-amber-500/20 px-2 py-1 text-[11px] text-amber-200">{conflict.severity}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                    <Button size="sm" variant="secondary" className="h-7 px-2">
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-300">
                      Ignore
                    </Button>
                  </div>
                </div>
              ))}
              {!conflicts.length && <p className="text-sm text-slate-400">No conflicts detected.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center gap-2 text-indigo-200">
              <Flame className="h-4 w-4" />
              <p className="text-sm uppercase tracking-wide">Identity Snapline</p>
            </div>
            <p className="mt-2 text-sm text-slate-200">Tracks how stable the active identity is across arcs.</p>
            <div className="mt-3 space-y-2">
              {driftSignals
                .filter((signal) => signal.attribute.toLowerCase().includes('identity'))
                .map((signal) => (
                  <div key={signal.attribute} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <div className="flex items-center justify-between text-sm text-white">
                      <span>{signal.notes}</span>
                      <span className="text-emerald-300">{Math.round((1 - signal.drift_score) * 100)}% stable</span>
                    </div>
                    <Meter value={1 - signal.drift_score} />
                  </div>
                ))}
              {!driftSignals.some((signal) => signal.attribute.toLowerCase().includes('identity')) && (
                <p className="text-sm text-slate-400">No identity drift detected.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center gap-2 text-indigo-200">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm uppercase tracking-wide">Continuity Report</p>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-200">
              {report || 'No report generated yet.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContinuityPanel;

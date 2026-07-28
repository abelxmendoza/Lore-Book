import { AlertTriangle, CheckCircle2, RefreshCw, SearchCode } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { fetchJson } from '../../lib/api';

type ResolvedEntity = {
  mention: string;
  canonicalName?: string;
  type?: string;
  confidence: number;
  method: string;
};

type QueryTrace = {
  at: string;
  query: string;
  intent: string;
  intentConfidence: number;
  resolvedEntities: ResolvedEntity[];
  executors: Array<{
    kind: string;
    executed: boolean;
    skipReason?: string;
    latencyMs?: number;
    recordCount?: number;
    confidence?: number;
    error?: string;
    tier?: number;
  }>;
  totalLatencyMs: number;
  mergedRecordCount: number;
  finalConfidence: number;
  earlyStopped: boolean;
};

export function QueryInspectorPanel() {
  const [traces, setTraces] = useState<QueryTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJson<{ traces: QueryTrace[] }>('/api/admin/query-inspector?limit=30');
      setTraces([...response.traces].reverse());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load query traces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4" aria-label="Query Inspector">
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SearchCode className="h-5 w-5 text-cyan-300" />
              <h2 className="text-xl font-semibold text-white">Query Inspector</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-white/55">
              See how LoreBook classified your question, resolved entities, selected retrieval
              sources, and arrived at its confidence. Only your own in-memory query traces appear here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && traces.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-8 text-center">
          <p className="font-medium text-white">No query traces yet</p>
          <p className="mt-1 text-sm text-white/45">
            Ask LoreBook a cross-Book or connection question, then refresh this panel.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {traces.map((trace, traceIndex) => (
          <details
            key={`${trace.at}:${traceIndex}`}
            className="group rounded-lg border border-white/10 bg-black/35 p-4 open:border-cyan-500/25"
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{trace.query}</p>
                  <p className="mt-1 text-xs text-white/45">
                    {trace.intent.replaceAll('_', ' ')} · {trace.mergedRecordCount} records ·{' '}
                    {trace.totalLatencyMs} ms
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-xs text-white/60">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  {Math.round(trace.finalConfidence * 100)}% confidence
                </span>
              </div>
            </summary>

            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                  Resolved entities
                </h3>
                <div className="mt-2 space-y-2">
                  {trace.resolvedEntities.length ? trace.resolvedEntities.map((entity) => (
                    <div key={`${entity.mention}:${entity.canonicalName}`} className="rounded-md bg-white/5 p-2 text-sm">
                      <span className="text-white">{entity.canonicalName ?? entity.mention}</span>
                      <span className="ml-2 text-xs text-white/40">
                        {entity.type ?? 'unknown'} · {entity.method} · {Math.round(entity.confidence * 100)}%
                      </span>
                    </div>
                  )) : (
                    <p className="text-sm text-white/35">No canonical entity anchor was needed.</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                  Retrieval sources
                </h3>
                <div className="mt-2 space-y-2">
                  {trace.executors.map((executor, index) => (
                    <div key={`${executor.kind}:${index}`} className="rounded-md bg-white/5 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{executor.kind.replaceAll('_', ' ')}</span>
                        <span className={executor.executed ? 'text-emerald-300' : 'text-white/35'}>
                          {executor.executed ? `${executor.recordCount ?? 0} records` : 'skipped'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/40">
                        {executor.executed
                          ? `tier ${executor.tier ?? '—'} · ${executor.latencyMs ?? 0} ms · ${Math.round((executor.confidence ?? 0) * 100)}%`
                          : executor.skipReason}
                      </p>
                      {executor.error && <p className="mt-1 text-xs text-amber-300">{executor.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

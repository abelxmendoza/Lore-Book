import { Activity, AlertTriangle, CheckCircle2, Play, ShieldCheck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { fetchJson } from '../lib/api';

type DiagnosticStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

interface PhaseResult {
  scenarioId: string;
  stepId: string;
  phase: string;
  name: string;
  status: DiagnosticStatus;
  durationMs: number;
  expected: string;
  actual: string;
}

interface ScenarioResult {
  id: string;
  name: string;
  priority: string;
  status: DiagnosticStatus;
  durationMs: number;
  phases: PhaseResult[];
  cleanupStatus: DiagnosticStatus;
}

interface DiagnosticRun {
  runId: string;
  status: DiagnosticStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  syntheticUser: {
    configured: boolean;
    userId: string | null;
  };
  environment: {
    nodeEnv: string | null;
    apiEnv: string | null;
    hasSupabaseUrl: boolean;
    hasSupabaseServiceRoleKey: boolean;
    hasOpenAiKey: boolean;
  };
  summary: Record<DiagnosticStatus, number>;
  scenarios: ScenarioResult[];
  warnings: string[];
}

interface CatalogResponse {
  result: DiagnosticRun;
}

const statusStyles: Record<DiagnosticStatus, string> = {
  PASS: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  WARN: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  FAIL: 'border-red-500/40 bg-red-500/10 text-red-200',
  SKIPPED: 'border-slate-500/40 bg-slate-500/10 text-slate-200',
};

const statusIcon = (status: DiagnosticStatus) => {
  if (status === 'PASS') return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'FAIL') return <XCircle className="h-4 w-4" />;
  if (status === 'WARN') return <AlertTriangle className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
};

type ChatDiagnosticsProps = {
  /** When true, render without full-page chrome (for Admin Console embed). */
  embedded?: boolean;
};

export default function ChatDiagnostics({ embedded = false }: ChatDiagnosticsProps) {
  const [run, setRun] = useState<DiagnosticRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (method: 'GET' | 'POST' = 'GET') => {
    try {
      method === 'POST' ? setRunning(true) : setLoading(true);
      setError(null);
      const data = method === 'POST'
        ? await fetchJson<DiagnosticRun>('/api/diagnostics/chat', { method: 'POST', body: JSON.stringify({ includeSkipped: true }) })
        : (await fetchJson<CatalogResponse>('/api/diagnostics/chat')).result;
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat diagnostics');
    } finally {
      setLoading(false);
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const body = (
      <div className={embedded ? 'flex flex-col gap-5' : 'mx-auto flex max-w-7xl flex-col gap-5'}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h1 className={`font-semibold tracking-normal ${embedded ? 'text-xl text-white' : 'text-2xl'}`}>
              Chat Reliability Diagnostics
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Shared diagnostics runner for CLI, API, and Admin Console. Run end-to-end chat reliability scenarios.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load('POST')}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            {running ? 'Running' : 'Run diagnostics'}
          </button>
        </header>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && !run ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">Loading diagnostics...</div>
        ) : run ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <div className={`rounded-md border p-4 ${statusStyles[run.status]}`}>
                <div className="flex items-center gap-2 text-sm font-medium">{statusIcon(run.status)} Overall</div>
                <div className="mt-2 text-3xl font-semibold">{run.status}</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                <div className="text-sm text-zinc-400">Run ID</div>
                <div className="mt-2 break-all font-mono text-sm">{run.runId}</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                <div className="text-sm text-zinc-400">Duration</div>
                <div className="mt-2 text-2xl font-semibold">{run.durationMs}ms</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center gap-2 text-sm text-zinc-400"><ShieldCheck className="h-4 w-4" /> Synthetic User</div>
                <div className="mt-2 text-sm">{run.syntheticUser.configured ? run.syntheticUser.userId : 'Not configured'}</div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
              {(['PASS', 'WARN', 'FAIL', 'SKIPPED'] as DiagnosticStatus[]).map((status) => (
                <div key={status} className={`rounded-md border px-4 py-3 ${statusStyles[status]}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{status}</span>
                    <span className="text-xl font-semibold">{run.summary[status]}</span>
                  </div>
                </div>
              ))}
            </section>

            {run.warnings.length > 0 && (
              <section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                {run.warnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </section>
            )}

            <section className="overflow-hidden rounded-md border border-zinc-800">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Scenario</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Phases</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {run.scenarios.map((scenario) => (
                    <tr key={scenario.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-medium text-zinc-100">{scenario.id}: {scenario.name}</div>
                        <div className="mt-1 text-xs text-zinc-500">{scenario.priority} · cleanup {scenario.cleanupStatus}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${statusStyles[scenario.status]}`}>
                          {statusIcon(scenario.status)}
                          {scenario.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          {scenario.phases.map((phase) => (
                            <div key={`${scenario.id}-${phase.stepId}`} className="rounded-md bg-zinc-900 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${statusStyles[phase.status]}`}>
                                  {statusIcon(phase.status)}
                                  {phase.status}
                                </span>
                                <span className="font-medium text-zinc-200">{phase.name}</span>
                                <span className="text-xs text-zinc-500">{phase.durationMs}ms</span>
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">{phase.actual}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{scenario.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </div>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4 text-zinc-100" data-testid="admin-chat-diagnostics">
        {body}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-6 text-zinc-100">
      {body}
    </main>
  );
}

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';
import { config } from '../config/env';
import './ChatDiagnostics.css';

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
    source?: string;
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

const statusPhaseClass: Record<DiagnosticStatus, string> = {
  PASS: 'diag-phase--pass',
  WARN: 'diag-phase--warn',
  FAIL: 'diag-phase--fail',
  SKIPPED: 'diag-phase--skipped',
};

const statusIcon = (status: DiagnosticStatus, className = 'h-4 w-4') => {
  if (status === 'PASS') return <CheckCircle2 className={className} />;
  if (status === 'FAIL') return <XCircle className={className} />;
  if (status === 'WARN') return <AlertTriangle className={className} />;
  return <Activity className={className} />;
};

const heroStatusClass = (status: DiagnosticStatus) => {
  if (status === 'PASS') return 'diag-hero--pass';
  if (status === 'FAIL') return 'diag-hero--fail';
  if (status === 'WARN') return 'diag-hero--warn';
  return '';
};

type ChatDiagnosticsProps = {
  /** When true, render without full-page chrome (for Admin Console embed). */
  embedded?: boolean;
};

type HubTab = 'core' | 'durability';

type CoreCheck = {
  id: string;
  name: string;
  suite: string;
  status: DiagnosticStatus;
  durationMs: number;
  expected: string;
  actual: string;
  fixHint?: string;
};

type CoreSuiteResult = {
  runId: string;
  status: DiagnosticStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: Record<DiagnosticStatus, number>;
  checks: CoreCheck[];
  suites: Array<{
    id: string;
    name: string;
    status: DiagnosticStatus;
    passCount: number;
    failCount: number;
    warnCount: number;
    skippedCount: number;
    detail?: string;
  }>;
};

const DIAG_TIMEOUT_MS = Math.max(config.api.adminTimeout ?? 20000, 45000);
const CORE_TIMEOUT_MS = Math.max(DIAG_TIMEOUT_MS, 90000);

export default function ChatDiagnostics({ embedded = false }: ChatDiagnosticsProps) {
  const [tab, setTab] = useState<HubTab>('core');
  const [run, setRun] = useState<DiagnosticRun | null>(null);
  const [core, setCore] = useState<CoreSuiteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [coreRunning, setCoreRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const [includeChatLive, setIncludeChatLive] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
  const [revealKey, setRevealKey] = useState(0);

  const load = useCallback(async (method: 'GET' | 'POST' = 'GET') => {
    try {
      if (method === 'POST') {
        setRunning(true);
        setJustFinished(false);
      } else {
        setLoading(true);
      }
      setError(null);

      const data =
        method === 'POST'
          ? await fetchJson<DiagnosticRun>(
              '/api/diagnostics/chat',
              {
                method: 'POST',
                body: JSON.stringify({ includeSkipped: true }),
              },
              { timeoutMs: DIAG_TIMEOUT_MS },
            )
          : (
              await fetchJson<CatalogResponse>('/api/diagnostics/chat', undefined, {
                timeoutMs: DIAG_TIMEOUT_MS,
              })
            ).result;

      setRun(data);
      setRevealKey((k) => k + 1);

      if (method === 'POST') {
        setJustFinished(true);
        const next: Record<string, boolean> = {};
        for (const s of data.scenarios) {
          if (s.status === 'FAIL' || s.status === 'WARN') next[s.id] = true;
        }
        setExpanded((prev) => ({ ...prev, ...next }));
        window.setTimeout(() => setJustFinished(false), 3200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat diagnostics');
    } finally {
      setLoading(false);
      setRunning(false);
    }
  }, []);

  const loadCoreSnapshot = useCallback(async () => {
    try {
      setCoreError(null);
      const data = await fetchJson<{ hasRun?: boolean; snapshot?: CoreSuiteResult }>(
        '/api/diagnostics/core',
        undefined,
        { timeoutMs: DIAG_TIMEOUT_MS },
      );
      if (data.snapshot) {
        setCore({
          ...data.snapshot,
          checks: (data.snapshot as CoreSuiteResult).checks ?? [],
          suites: (data.snapshot as CoreSuiteResult).suites ?? [],
          summary: data.snapshot.summary,
          runId: data.snapshot.runId,
          status: data.snapshot.status,
          startedAt: data.snapshot.completedAt,
          completedAt: data.snapshot.completedAt,
          durationMs: data.snapshot.durationMs,
        });
      }
    } catch {
      // No prior run is fine
    }
  }, []);

  const runCore = useCallback(async () => {
    try {
      setCoreRunning(true);
      setCoreError(null);
      setJustFinished(false);
      const data = await fetchJson<CoreSuiteResult>(
        '/api/diagnostics/core',
        {
          method: 'POST',
          body: JSON.stringify({ includeChatLive }),
        },
        { timeoutMs: CORE_TIMEOUT_MS },
      );
      setCore(data);
      setRevealKey((k) => k + 1);
      setJustFinished(true);
      const next: Record<string, boolean> = {};
      for (const c of data.checks) {
        if (c.status === 'FAIL' || c.status === 'WARN') next[c.id] = true;
      }
      setExpandedChecks((prev) => ({ ...prev, ...next }));
      window.setTimeout(() => setJustFinished(false), 3200);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : 'Failed to run core suite');
    } finally {
      setCoreRunning(false);
    }
  }, [includeChatLive]);

  useEffect(() => {
    void load();
    void loadCoreSnapshot();
  }, [load, loadCoreSnapshot]);

  const toggleScenario = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const passRate = useMemo(() => {
    if (!run) return 0;
    const total =
      run.summary.PASS + run.summary.WARN + run.summary.FAIL + run.summary.SKIPPED;
    if (total === 0) return 0;
    return Math.round((run.summary.PASS / total) * 100);
  }, [run]);

  const corePassRate = useMemo(() => {
    if (!core) return 0;
    const total =
      core.summary.PASS + core.summary.WARN + core.summary.FAIL + core.summary.SKIPPED;
    if (total === 0) return 0;
    return Math.round((core.summary.PASS / total) * 100);
  }, [core]);

  const body = (
    <div className={`diag-panel ${embedded ? 'flex flex-col gap-5' : 'mx-auto flex max-w-7xl flex-col gap-5'}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <h1
            className={`font-semibold tracking-normal ${embedded ? 'text-xl text-white' : 'text-2xl text-zinc-50'}`}
          >
            System Health
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Must-pass checks for chat, foundation recall, and LoreBook self-knowledge — plus chat durability probes.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="System Health tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'core'}
          onClick={() => setTab('core')}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            tab === 'core'
              ? 'border-violet-500/50 bg-violet-600/20 text-violet-100'
              : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          Core suite
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'durability'}
          onClick={() => setTab('durability')}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            tab === 'durability'
              ? 'border-violet-500/50 bg-violet-600/20 text-violet-100'
              : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          Chat durability
        </button>
      </div>

      {tab === 'core' && (
        <div className="flex flex-col gap-5" data-testid="diag-core-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={includeChatLive}
                onChange={(e) => setIncludeChatLive(e.target.checked)}
                className="rounded border-zinc-600"
              />
              Include live chat durability probes
            </label>
            <button
              type="button"
              onClick={() => void runCore()}
              disabled={coreRunning}
              data-testid="diag-core-run-button"
              className={`diag-run-btn inline-flex items-center gap-2 rounded-lg border border-violet-500/50 bg-violet-600/20 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-600/30 disabled:cursor-not-allowed disabled:opacity-60 ${
                coreRunning ? 'diag-run-btn--running' : ''
              }`}
            >
              {coreRunning ? <Loader2 className="h-4 w-4 diag-spinner" /> : <Play className="h-4 w-4" />}
              {coreRunning ? 'Running core suite…' : 'Run all core checks'}
            </button>
          </div>

          {coreRunning && (
            <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 text-sm text-violet-200">
                <Loader2 className="h-4 w-4 diag-spinner" />
                <span>Boot → durability → recall routing → self-knowledge…</span>
              </div>
              <div className="diag-progress-track">
                <div className="diag-progress-bar" />
              </div>
            </div>
          )}

          {coreError && (
            <div className="diag-banner-error rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <p className="font-medium">Core suite failed to run</p>
              <p className="mt-1 text-red-200/80">{coreError}</p>
            </div>
          )}

          {!core && !coreRunning ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">
              No core suite run yet. Click <span className="text-zinc-200">Run all core checks</span> to
              validate boot config, recall routing, and that LoreBook can answer who created it and what it can do.
            </div>
          ) : core ? (
            <>
              <section
                key={`core-hero-${revealKey}`}
                className={`diag-hero rounded-2xl border p-5 md:p-6 ${statusStyles[core.status]} ${
                  justFinished && tab === 'core' ? heroStatusClass(core.status) : ''
                }`}
                data-testid="diag-core-overall-status"
                data-status={core.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="diag-status-badge flex h-12 w-12 items-center justify-center rounded-xl border border-current/20 bg-black/20">
                      {statusIcon(core.status, 'h-7 w-7')}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Core suite</p>
                      <p className="mt-0.5 text-3xl font-bold tracking-tight">{core.status}</p>
                      <p className="mt-1 text-sm opacity-80">
                        {core.status === 'PASS' && 'Must-pass checks look healthy — LoreBook is ready for user lore.'}
                        {core.status === 'FAIL' && 'One or more must-pass checks failed — expand red rows for fix hints.'}
                        {core.status === 'WARN' && 'Finished with warnings — review yellow rows.'}
                        {core.status === 'SKIPPED' && 'Checks were skipped — usually missing env or synthetic user.'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide opacity-60">Pass rate</p>
                    <p className="diag-stat-num text-3xl font-bold tabular-nums">{corePassRate}%</p>
                    <p className="text-xs opacity-60">{core.durationMs}ms</p>
                  </div>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {core.suites.map((suite) => (
                  <div
                    key={suite.id}
                    className={`rounded-xl border p-4 ${statusStyles[suite.status]}`}
                    data-testid={`diag-core-suite-${suite.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{suite.name}</p>
                      {statusIcon(suite.status)}
                    </div>
                    <p className="mt-2 text-xs opacity-80">
                      {suite.passCount} pass · {suite.failCount} fail · {suite.warnCount} warn
                    </p>
                    {suite.detail ? (
                      <p className="mt-2 text-[11px] opacity-70 line-clamp-2">{suite.detail}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-200">Checks</h2>
                {core.checks.map((check) => {
                  const open = expandedChecks[check.id];
                  return (
                    <div
                      key={check.id}
                      className={`rounded-xl border ${statusStyles[check.status]} bg-black/20`}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        onClick={() =>
                          setExpandedChecks((prev) => ({ ...prev, [check.id]: !prev[check.id] }))
                        }
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {statusIcon(check.status)}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{check.name}</p>
                            <p className="text-[11px] opacity-70">{check.suite} · {check.durationMs}ms</p>
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="space-y-2 border-t border-current/10 px-4 py-3 text-xs opacity-90">
                          <p>
                            <span className="font-semibold">Expected:</span> {check.expected}
                          </p>
                          <p>
                            <span className="font-semibold">Actual:</span> {check.actual}
                          </p>
                          {check.fixHint ? (
                            <p className="text-amber-100/90">
                              <span className="font-semibold">Fix:</span> {check.fixHint}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          ) : null}
        </div>
      )}

      {tab === 'durability' && (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Live synthetic-user probes for threads, messages, isolation, and cleanup.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load('GET')}
            disabled={running || loading}
            className="diag-run-btn inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh last run catalog"
          >
            <RefreshCw className={`h-4 w-4 ${loading && !running ? 'diag-spinner' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void load('POST')}
            disabled={running}
            data-testid="diag-run-button"
            className={`diag-run-btn inline-flex items-center gap-2 rounded-lg border border-violet-500/50 bg-violet-600/20 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-600/30 disabled:cursor-not-allowed disabled:opacity-60 ${
              running ? 'diag-run-btn--running' : ''
            }`}
          >
            {running ? (
              <Loader2 className="h-4 w-4 diag-spinner" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? 'Running live probes…' : 'Run diagnostics'}
          </button>
        </div>
      </div>

      {running && (
        <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4" data-testid="diag-running-banner">
          <div className="flex items-center gap-2 text-sm text-violet-200">
            <Loader2 className="h-4 w-4 diag-spinner" />
            <span>Executing scenarios against synthetic diagnostic user…</span>
          </div>
          <div className="diag-progress-track">
            <div className="diag-progress-bar" />
          </div>
          <p className="text-[11px] text-violet-300/70">
            Creating threads, writing messages, checking isolation, cleaning up by runId
          </p>
        </div>
      )}

      {error && (
        <div
          className="diag-banner-error rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          data-testid="diag-error"
        >
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Diagnostics failed to run</p>
              <p className="mt-1 text-red-200/80">{error}</p>
              <p className="mt-2 text-[11px] text-red-200/50">
                Check that the API is running and you have admin access. Restart the server after setting
                LOREBOOK_DIAGNOSTIC_USER_ID.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading && !run ? (
        <div className="space-y-3">
          <div className="diag-skeleton h-28 w-full" />
          <div className="grid gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="diag-skeleton h-16" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="diag-skeleton h-48 w-full" />
        </div>
      ) : run ? (
        <>
          {/* Outcome hero */}
          <section
            key={`hero-${revealKey}`}
            className={`diag-hero rounded-2xl border p-5 md:p-6 ${statusStyles[run.status]} ${
              justFinished ? heroStatusClass(run.status) : ''
            }`}
            data-testid="diag-overall-status"
            data-status={run.status}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  key={`icon-${revealKey}`}
                  className="diag-status-badge flex h-12 w-12 items-center justify-center rounded-xl border border-current/20 bg-black/20"
                >
                  {statusIcon(run.status, 'h-7 w-7')}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Overall</p>
                  <p className="mt-0.5 text-3xl font-bold tracking-tight">{run.status}</p>
                  <p className="mt-1 text-sm opacity-80">
                    {run.status === 'PASS' && 'All scenarios passed — live probes completed cleanly.'}
                    {run.status === 'FAIL' && 'One or more scenarios failed — expand red rows for details.'}
                    {run.status === 'WARN' &&
                      'Run finished with warnings or skips — check the notes below.'}
                    {run.status === 'SKIPPED' && 'Scenarios were skipped (usually missing synthetic user).'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide opacity-60">Pass rate</p>
                <p key={`rate-${revealKey}`} className="diag-stat-num text-3xl font-bold tabular-nums">
                  {passRate}%
                </p>
                <p className="text-xs opacity-60">{run.durationMs}ms total</p>
              </div>
            </div>
          </section>

          {/* Meta cards */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Run ID', value: run.runId, mono: true },
              { label: 'Duration', value: `${run.durationMs}ms`, mono: false },
              {
                label: 'Synthetic user',
                value: run.syntheticUser.configured
                  ? run.syntheticUser.userId ?? '—'
                  : 'Not configured',
                mono: true,
                sub: run.syntheticUser.source ? `source: ${run.syntheticUser.source}` : undefined,
              },
              {
                label: 'Environment',
                value: [
                  run.environment.hasSupabaseUrl ? 'Supabase ✓' : 'Supabase ✗',
                  run.environment.hasOpenAiKey ? 'OpenAI ✓' : 'OpenAI ✗',
                ].join(' · '),
                mono: false,
              },
            ].map((card, i) => (
              <div
                key={`${card.label}-${revealKey}`}
                className="diag-stat-card rounded-xl border border-zinc-800 bg-zinc-900/80 p-4"
                style={{ animationDelay: `${80 + i * 60}ms` }}
              >
                <div className="text-xs text-zinc-500">{card.label}</div>
                <div
                  className={`mt-2 text-sm text-zinc-100 ${card.mono ? 'break-all font-mono text-xs' : 'font-semibold'}`}
                >
                  {card.value}
                </div>
                {card.sub && <div className="mt-1 text-[11px] text-zinc-500">{card.sub}</div>}
              </div>
            ))}
          </section>

          {/* Summary counts */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(['PASS', 'WARN', 'FAIL', 'SKIPPED'] as DiagnosticStatus[]).map((status, i) => (
              <div
                key={`${status}-${revealKey}`}
                className={`diag-stat-card rounded-xl border px-4 py-3 ${statusStyles[status]}`}
                style={{ animationDelay: `${120 + i * 50}ms` }}
                data-testid={`diag-summary-${status.toLowerCase()}`}
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {statusIcon(status, 'h-3.5 w-3.5')}
                    {status}
                  </span>
                  <span key={`n-${status}-${revealKey}`} className="diag-stat-num text-2xl font-bold">
                    {run.summary[status]}
                  </span>
                </div>
              </div>
            ))}
          </section>

          {run.warnings.length > 0 && (
            <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100 space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Notes
              </p>
              {run.warnings.map((warning) => (
                <div key={warning} className="pl-6 text-amber-100/85">
                  {warning}
                </div>
              ))}
            </section>
          )}

          {justFinished && run.summary.FAIL === 0 && run.summary.SKIPPED === 0 && (
            <section
              className="diag-banner-success flex items-start gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-100"
              data-testid="diag-success-banner"
            >
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <div>
                <p className="font-semibold">Diagnostics run succeeded</p>
                <p className="mt-1 text-emerald-100/80">
                  Live probes completed against synthetic user{' '}
                  <span className="font-mono text-xs">{run.syntheticUser.userId}</span>
                  . Threads, messages, isolation checks, and cleanup all passed.
                </p>
              </div>
            </section>
          )}

          {justFinished && run.summary.FAIL > 0 && (
            <section
              className="diag-banner-error flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
              data-testid="diag-fail-banner"
            >
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{run.summary.FAIL} scenario(s) failed</p>
                <p className="mt-1 text-red-100/80">
                  Expand the highlighted rows below to see which phase broke and the actual error.
                </p>
              </div>
            </section>
          )}

          {/* Scenario list */}
          <section className="space-y-2" data-testid="diag-scenario-list">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Scenarios</p>
            {run.scenarios.map((scenario, si) => {
              const open = expanded[scenario.id] ?? false;
              return (
                <div
                  key={`${scenario.id}-${revealKey}`}
                  className={`diag-row overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/60 ${
                    scenario.status === 'FAIL' ? 'border-red-500/35' : ''
                  } ${scenario.status === 'PASS' && justFinished ? 'border-emerald-500/20' : ''}`}
                  style={{ animationDelay: `${150 + si * 45}ms` }}
                  data-testid={`diag-scenario-${scenario.id}`}
                  data-status={scenario.status}
                >
                  <button
                    type="button"
                    onClick={() => toggleScenario(scenario.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
                  >
                    <span
                      key={`${scenario.id}-badge-${revealKey}`}
                      className={`diag-status-badge inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[scenario.status]}`}
                      style={{ animationDelay: `${200 + si * 45}ms` }}
                    >
                      {statusIcon(scenario.status, 'h-3.5 w-3.5')}
                      {scenario.status}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-zinc-100">
                        {scenario.id}: {scenario.name}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {scenario.priority} · cleanup {scenario.cleanupStatus} · {scenario.durationMs}ms ·{' '}
                        {scenario.phases.length} phases
                      </div>
                    </div>
                    <ChevronDown
                      className="diag-expand-btn h-4 w-4 shrink-0 text-zinc-500"
                      data-open={open ? 'true' : 'false'}
                    />
                  </button>

                  {open && (
                    <div className="diag-expand border-t border-zinc-800/80 px-4 py-3">
                      <div className="space-y-2">
                        {scenario.phases.map((phase, pi) => (
                          <div
                            key={`${scenario.id}-${phase.stepId}`}
                            className={`diag-phase rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 ${statusPhaseClass[phase.status]}`}
                            style={{ animationDelay: `${pi * 40}ms` }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`diag-status-badge inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${statusStyles[phase.status]}`}
                              >
                                {statusIcon(phase.status, 'h-3 w-3')}
                                {phase.status}
                              </span>
                              <span className="font-medium text-zinc-200">{phase.name}</span>
                              <span className="text-xs text-zinc-500">{phase.durationMs}ms</span>
                              <span className="text-[10px] uppercase tracking-wide text-zinc-600">
                                {phase.phase}
                              </span>
                            </div>
                            <div className="mt-1.5 text-xs leading-relaxed text-zinc-400">{phase.actual}</div>
                            {phase.status === 'FAIL' && phase.expected && (
                              <div className="mt-1 text-[11px] text-red-300/70">
                                Expected: {phase.expected}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </>
      ) : null}
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div
        className="rounded-xl border border-purple-500/30 bg-black/40 p-4 text-zinc-100 sm:p-5"
        data-testid="admin-chat-diagnostics"
      >
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

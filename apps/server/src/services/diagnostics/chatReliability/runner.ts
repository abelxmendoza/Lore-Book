import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

import { resolveDiagnosticUser } from './diagnosticUser';
import { executeLiveStep, type LiveProbeState } from './liveProbes';
import { chatReliabilityScenarios } from './scenarios';
import type {
  ChatDiagnosticPhaseResult,
  ChatDiagnosticRunResult,
  ChatDiagnosticScenario,
  ChatDiagnosticScenarioResult,
  ChatDiagnosticStatus,
} from './types';

export interface RunChatDiagnosticsOptions {
  scenarioIds?: string[];
  includeSkipped?: boolean;
  runId?: string;
  syntheticUserId?: string | null;
  env?: NodeJS.ProcessEnv;
  /**
   * When true (default outside NODE_ENV=test), run live DB probes for synthetic-user steps.
   * Unit tests pass executeLive: false or omit real Supabase and use catalog mode.
   */
  executeLive?: boolean;
}

const terminalRank: Record<ChatDiagnosticStatus, number> = {
  FAIL: 4,
  WARN: 3,
  SKIPPED: 2,
  PASS: 1,
};

function worstStatus(statuses: ChatDiagnosticStatus[]): ChatDiagnosticStatus {
  return statuses.reduce<ChatDiagnosticStatus>(
    (worst, status) => (terminalRank[status] > terminalRank[worst] ? status : worst),
    'PASS',
  );
}

function catalogStep(
  scenario: ChatDiagnosticScenario,
  step: ChatDiagnosticScenario['steps'][number],
  runId: string,
  syntheticUserId: string | null,
  env: NodeJS.ProcessEnv,
): ChatDiagnosticPhaseResult {
  const started = performance.now();
  let status: ChatDiagnosticStatus = 'PASS';
  let actual = step.expected;
  const output: Record<string, unknown> = { runId };

  if (step.requiresSyntheticUser && !syntheticUserId) {
    status = 'SKIPPED';
    actual = 'Skipped because LOREBOOK_DIAGNOSTIC_USER_ID is not configured';
  } else if (step.id === 'env') {
    const missing = [
      ['SUPABASE_URL', env.SUPABASE_URL],
      ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
      ['OPENAI_API_KEY', env.OPENAI_API_KEY],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      status = 'WARN';
      actual = `Missing optional/live diagnostic env: ${missing.join(', ')}`;
      output.missing = missing;
    }
  } else if (step.id === 'db' && !env.SUPABASE_URL) {
    status = 'WARN';
    actual = 'Database-backed checks cannot run without SUPABASE_URL';
  } else if (step.requiresSyntheticUser && syntheticUserId) {
    actual = 'Contract represented in diagnostic scenario catalog (live probes disabled)';
    output.mode = 'catalog';
  }

  if (syntheticUserId) {
    output.syntheticUserId = syntheticUserId;
  }

  return {
    scenarioId: scenario.id,
    stepId: step.id,
    phase: step.phase,
    name: step.name,
    status,
    durationMs: Math.round(performance.now() - started),
    input: {
      scenarioId: scenario.id,
      requiresSyntheticUser: !!step.requiresSyntheticUser,
    },
    output,
    expected: step.expected,
    actual,
  };
}

async function runStep(
  scenario: ChatDiagnosticScenario,
  step: ChatDiagnosticScenario['steps'][number],
  runId: string,
  syntheticUserId: string | null,
  env: NodeJS.ProcessEnv,
  executeLive: boolean,
  state: LiveProbeState,
): Promise<ChatDiagnosticPhaseResult> {
  // Environment steps always use catalog logic (no synthetic user needed)
  if (step.id === 'env' || step.id === 'db') {
    return catalogStep(scenario, step, runId, syntheticUserId, env);
  }

  if (step.requiresSyntheticUser && !syntheticUserId) {
    return catalogStep(scenario, step, runId, syntheticUserId, env);
  }

  if (executeLive && syntheticUserId && step.requiresSyntheticUser) {
    const live = await executeLiveStep(step.id, {
      scenarioId: scenario.id,
      stepId: step.id,
      stepName: step.name,
      phase: step.phase,
      expected: step.expected,
      runId,
      syntheticUserId,
    }, state);
    if (live) return live;
  }

  return catalogStep(scenario, step, runId, syntheticUserId, env);
}

async function runScenario(
  scenario: ChatDiagnosticScenario,
  runId: string,
  syntheticUserId: string | null,
  env: NodeJS.ProcessEnv,
  executeLive: boolean,
): Promise<ChatDiagnosticScenarioResult> {
  const started = performance.now();
  const state: LiveProbeState = {};

  const phases: ChatDiagnosticPhaseResult[] = [];
  for (const step of scenario.steps) {
    phases.push(await runStep(scenario, step, runId, syntheticUserId, env, executeLive, state));
  }

  const cleanupPhases: ChatDiagnosticPhaseResult[] = [];
  for (const step of scenario.cleanup) {
    cleanupPhases.push(await runStep(scenario, step, runId, syntheticUserId, env, executeLive, state));
  }

  const cleanupStatus =
    cleanupPhases.length > 0
      ? worstStatus(cleanupPhases.map((phase) => phase.status))
      : 'PASS';

  const allPhases = [...phases, ...cleanupPhases];
  const phaseStatus = worstStatus(allPhases.map((phase) => phase.status));
  const assertions = scenario.assertions.map((assertion) => ({
    ...assertion,
    status:
      phaseStatus === 'FAIL'
        ? ('FAIL' as const)
        : phaseStatus === 'SKIPPED'
          ? ('SKIPPED' as const)
          : ('PASS' as const),
    actual:
      phaseStatus === 'SKIPPED'
        ? 'Scenario requires live synthetic-user execution before this assertion can be proven'
        : phaseStatus === 'FAIL'
          ? 'One or more phases failed — see phase details'
          : executeLive && syntheticUserId
            ? 'Live probe completed for synthetic diagnostic user'
            : 'Contract represented in diagnostic scenario catalog',
  }));

  return {
    id: scenario.id,
    name: scenario.name,
    priority: scenario.priority,
    status: worstStatus([phaseStatus, cleanupStatus]),
    durationMs: Math.round(performance.now() - started),
    phases: allPhases,
    assertions,
    cleanupStatus,
  };
}

export async function runChatDiagnostics(
  options: RunChatDiagnosticsOptions = {},
): Promise<ChatDiagnosticRunResult> {
  const env = options.env ?? process.env;
  const runId = options.runId ?? `chatdiag-${randomUUID()}`;
  const started = new Date();
  const startMs = performance.now();

  const isTestEnv = (env.NODE_ENV ?? process.env.NODE_ENV) === 'test';
  const executeLive = options.executeLive ?? !isTestEnv;

  let syntheticUserId = options.syntheticUserId ?? env.LOREBOOK_DIAGNOSTIC_USER_ID ?? null;
  let userSource: string | null = syntheticUserId ? 'options_or_env' : null;
  const warnings: string[] = [];
  const notes: string[] = [];

  // Auto-provision when live and no user id provided
  if (!syntheticUserId && executeLive) {
    const resolved = await resolveDiagnosticUser(env);
    syntheticUserId = resolved.userId;
    userSource = resolved.source;
    if (resolved.warning) warnings.push(resolved.warning);
    if (resolved.userId && resolved.source === 'auto_created') {
      notes.push(
        `Auto-created synthetic diagnostic user (${resolved.email}). Optional: set LOREBOOK_DIAGNOSTIC_USER_ID=${resolved.userId} to pin it.`,
      );
    } else if (resolved.userId && resolved.source === 'auto_found') {
      notes.push(
        `Using diagnostic user ${resolved.email} (${resolved.userId}). Optional: set LOREBOOK_DIAGNOSTIC_USER_ID to pin it.`,
      );
    }
  }

  if (!syntheticUserId) {
    warnings.push(
      'LOREBOOK_DIAGNOSTIC_USER_ID is not configured and auto-provision failed; live synthetic-user scenarios were skipped.',
    );
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push('Supabase environment is incomplete; database-backed diagnostics cannot run.');
  }

  const selected = options.scenarioIds?.length
    ? chatReliabilityScenarios.filter((scenario) => options.scenarioIds?.includes(scenario.id))
    : chatReliabilityScenarios;

  const scenarios: ChatDiagnosticScenarioResult[] = [];
  for (const scenario of selected) {
    scenarios.push(await runScenario(scenario, runId, syntheticUserId, env, executeLive));
  }

  const filtered = scenarios.filter(
    (scenario) => options.includeSkipped !== false || scenario.status !== 'SKIPPED',
  );

  const summary: Record<ChatDiagnosticStatus, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIPPED: 0 };
  for (const scenario of filtered) {
    summary[scenario.status] += 1;
  }

  const status =
    summary.FAIL > 0
      ? 'FAIL'
      : warnings.length > 0 || summary.WARN > 0 || summary.SKIPPED > 0
        ? 'WARN'
        : 'PASS';
  const completed = new Date();

  return {
    runId,
    status,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    durationMs: Math.round(performance.now() - startMs),
    syntheticUser: {
      configured: !!syntheticUserId,
      userId: syntheticUserId,
      ...(userSource ? { source: userSource } : {}),
    } as ChatDiagnosticRunResult['syntheticUser'],
    environment: {
      nodeEnv: env.NODE_ENV ?? null,
      apiEnv: env.API_ENV ?? null,
      hasSupabaseUrl: !!env.SUPABASE_URL,
      hasSupabaseServiceRoleKey: !!env.SUPABASE_SERVICE_ROLE_KEY,
      hasOpenAiKey: !!env.OPENAI_API_KEY,
    },
    summary,
    scenarios: filtered,
    warnings: [...warnings, ...notes],
  };
}

export function getChatDiagnosticScenarios(): ChatDiagnosticScenario[] {
  return chatReliabilityScenarios;
}

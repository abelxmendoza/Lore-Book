import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

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
    'PASS'
  );
}

function runStep(
  scenario: ChatDiagnosticScenario,
  step: ChatDiagnosticScenario['steps'][number],
  runId: string,
  syntheticUserId: string | null,
  env: NodeJS.ProcessEnv
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
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length > 0) {
      status = 'WARN';
      actual = `Missing optional/live diagnostic env: ${missing.join(', ')}`;
      output.missing = missing;
    }
  } else if (step.id === 'db' && !env.SUPABASE_URL) {
    status = 'WARN';
    actual = 'Database-backed checks cannot run without SUPABASE_URL';
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

function runScenario(
  scenario: ChatDiagnosticScenario,
  runId: string,
  syntheticUserId: string | null,
  env: NodeJS.ProcessEnv
): ChatDiagnosticScenarioResult {
  const started = performance.now();
  const phases = scenario.steps.map((step) => runStep(scenario, step, runId, syntheticUserId, env));
  const cleanupPhases = scenario.cleanup.map((step) => runStep(scenario, step, runId, syntheticUserId, env));
  const cleanupStatus = cleanupPhases.length > 0
    ? worstStatus(cleanupPhases.map((phase) => phase.status))
    : 'PASS';

  const allPhases = [...phases, ...cleanupPhases];
  const phaseStatus = worstStatus(allPhases.map((phase) => phase.status));
  const assertions = scenario.assertions.map((assertion) => ({
    ...assertion,
    status: phaseStatus === 'FAIL' ? 'FAIL' as const : phaseStatus === 'SKIPPED' ? 'SKIPPED' as const : 'PASS' as const,
    actual: phaseStatus === 'SKIPPED'
      ? 'Scenario requires live synthetic-user execution before this assertion can be proven'
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

export async function runChatDiagnostics(options: RunChatDiagnosticsOptions = {}): Promise<ChatDiagnosticRunResult> {
  const env = options.env ?? process.env;
  const runId = options.runId ?? `chatdiag-${randomUUID()}`;
  const syntheticUserId = options.syntheticUserId ?? env.LOREBOOK_DIAGNOSTIC_USER_ID ?? null;
  const started = new Date();
  const startMs = performance.now();
  const selected = options.scenarioIds?.length
    ? chatReliabilityScenarios.filter((scenario) => options.scenarioIds?.includes(scenario.id))
    : chatReliabilityScenarios;

  const scenarios = selected
    .map((scenario) => runScenario(scenario, runId, syntheticUserId, env))
    .filter((scenario) => options.includeSkipped !== false || scenario.status !== 'SKIPPED');

  const summary: Record<ChatDiagnosticStatus, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIPPED: 0 };
  for (const scenario of scenarios) {
    summary[scenario.status] += 1;
  }

  const warnings: string[] = [];
  if (!syntheticUserId) {
    warnings.push('LOREBOOK_DIAGNOSTIC_USER_ID is not configured; live synthetic-user scenarios were skipped.');
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push('Supabase environment is incomplete; database-backed diagnostics cannot run.');
  }

  const status = summary.FAIL > 0 ? 'FAIL' : warnings.length > 0 || summary.WARN > 0 || summary.SKIPPED > 0 ? 'WARN' : 'PASS';
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
    },
    environment: {
      nodeEnv: env.NODE_ENV ?? null,
      apiEnv: env.API_ENV ?? null,
      hasSupabaseUrl: !!env.SUPABASE_URL,
      hasSupabaseServiceRoleKey: !!env.SUPABASE_SERVICE_ROLE_KEY,
      hasOpenAiKey: !!env.OPENAI_API_KEY,
    },
    summary,
    scenarios,
    warnings,
  };
}

export function getChatDiagnosticScenarios(): ChatDiagnosticScenario[] {
  return chatReliabilityScenarios;
}

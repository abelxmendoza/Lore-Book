export type ChatDiagnosticStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

export type ChatDiagnosticPriority = 'P0' | 'P1' | 'P2';

export interface ChatDiagnosticAssertion {
  id: string;
  description: string;
}

export interface ChatDiagnosticStep {
  id: string;
  name: string;
  phase:
    | 'environment'
    | 'authentication'
    | 'thread'
    | 'hydration'
    | 'message'
    | 'streaming'
    | 'query'
    | 'ingestion'
    | 'identity'
    | 'recovery'
    | 'security'
    | 'cleanup';
  requiresSyntheticUser?: boolean;
  expected: string;
}

export interface ChatDiagnosticScenario {
  id: string;
  name: string;
  priority: ChatDiagnosticPriority;
  destructive: false;
  steps: ChatDiagnosticStep[];
  assertions: ChatDiagnosticAssertion[];
  cleanup: ChatDiagnosticStep[];
}

export interface ChatDiagnosticPhaseResult {
  scenarioId: string;
  stepId: string;
  phase: ChatDiagnosticStep['phase'];
  name: string;
  status: ChatDiagnosticStatus;
  durationMs: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  expected: string;
  actual: string;
}

export interface ChatDiagnosticScenarioResult {
  id: string;
  name: string;
  priority: ChatDiagnosticPriority;
  status: ChatDiagnosticStatus;
  durationMs: number;
  phases: ChatDiagnosticPhaseResult[];
  assertions: Array<ChatDiagnosticAssertion & {
    status: ChatDiagnosticStatus;
    actual: string;
  }>;
  cleanupStatus: ChatDiagnosticStatus;
}

export interface ChatDiagnosticRunResult {
  runId: string;
  status: ChatDiagnosticStatus;
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
  summary: Record<ChatDiagnosticStatus, number>;
  scenarios: ChatDiagnosticScenarioResult[];
  warnings: string[];
}

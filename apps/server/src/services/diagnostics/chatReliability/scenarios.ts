import type { ChatDiagnosticScenario } from './types';

const cleanup = (scenarioId: string) => [
  {
    id: `${scenarioId}-cleanup`,
    name: 'Diagnostic records remain scoped by runId',
    phase: 'cleanup' as const,
    requiresSyntheticUser: true,
    expected: 'Generated records are findable by runId and owned by the synthetic diagnostic user',
  },
];

export const chatReliabilityScenarios: ChatDiagnosticScenario[] = [
  {
    id: 'CHAT-001',
    name: 'Runtime boot contract',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'env', name: 'Required runtime variables', phase: 'environment', expected: 'Supabase URL, service role and model configuration are detectable' },
      { id: 'db', name: 'Database dependency declared', phase: 'environment', expected: 'Diagnostics know whether database-backed checks can run' },
    ],
    assertions: [
      { id: 'boot-env', description: 'App boot health is represented before chat scenarios run' },
      { id: 'no-secret-output', description: 'Diagnostic output exposes presence flags only, never secret values' },
    ],
    cleanup: [],
  },
  {
    id: 'CHAT-002',
    name: 'Synthetic diagnostic user isolation',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'synthetic-user', name: 'Synthetic user configured', phase: 'authentication', requiresSyntheticUser: true, expected: 'LOREBOOK_DIAGNOSTIC_USER_ID is configured and used for all generated data' },
      { id: 'run-id', name: 'Run ID attached', phase: 'security', expected: 'Every scenario receives the same unique runId' },
    ],
    assertions: [
      { id: 'never-real-user', description: 'Diagnostics refuse live mutations without a synthetic diagnostic user' },
      { id: 'run-scope', description: 'All generated records are intended to carry runId metadata' },
    ],
    cleanup: cleanup('CHAT-002'),
  },
  {
    id: 'CHAT-003',
    name: 'Thread lifecycle and hydration',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'create-thread', name: 'Create temporary thread', phase: 'thread', requiresSyntheticUser: true, expected: 'Thread is created once with runId metadata' },
      { id: 'reload-thread', name: 'Reload canonical thread', phase: 'hydration', requiresSyntheticUser: true, expected: 'Hydration restores the same thread without duplicate messages' },
      { id: 'delete-thread', name: 'Delete temporary thread', phase: 'cleanup', requiresSyntheticUser: true, expected: 'Temporary thread is removed during cleanup' },
    ],
    assertions: [
      { id: 'no-double-hydration', description: 'Reload does not duplicate user or assistant messages' },
      { id: 'canonical-state', description: 'Backend state remains canonical after reload' },
    ],
    cleanup: cleanup('CHAT-003'),
  },
  {
    id: 'CHAT-004',
    name: 'Thread isolation during streaming',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'thread-a', name: 'Thread A accepts one message', phase: 'message', requiresSyntheticUser: true, expected: 'User message appears and persists exactly once' },
      { id: 'stream-start', name: 'Assistant stream starts', phase: 'streaming', requiresSyntheticUser: true, expected: 'Tokens arrive in order with lifecycle events' },
      { id: 'switch-thread', name: 'Navigate to Thread B', phase: 'thread', requiresSyntheticUser: true, expected: 'In-flight response stays scoped to Thread A' },
    ],
    assertions: [
      { id: 'no-contamination', description: 'Thread B remains uncontaminated by Thread A streaming output' },
      { id: 'persist-to-source', description: 'Completion persists only to the source thread' },
    ],
    cleanup: cleanup('CHAT-004'),
  },
  {
    id: 'CHAT-005',
    name: 'Streaming cancellation and retry',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'cancel', name: 'Cancel in-flight response', phase: 'streaming', requiresSyntheticUser: true, expected: 'Cancellation produces controlled terminal state' },
      { id: 'retry', name: 'Retry cancelled response', phase: 'streaming', requiresSyntheticUser: true, expected: 'Retry does not duplicate the original user message' },
    ],
    assertions: [
      { id: 'ordered-events', description: 'Stream lifecycle events are ordered and non-duplicated' },
      { id: 'retry-idempotent', description: 'Retry reuses canonical message state instead of forking stale state' },
    ],
    cleanup: cleanup('CHAT-005'),
  },
  {
    id: 'CHAT-006',
    name: 'Query pipeline trace completeness',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'classifier', name: 'Classifier emits intent', phase: 'query', requiresSyntheticUser: true, expected: 'Intent classification is present in trace' },
      { id: 'resolver', name: 'Entity resolver emits resolution state', phase: 'query', requiresSyntheticUser: true, expected: 'Exact, alias, ambiguous or unresolved state is explicit' },
      { id: 'planner-executors-merge', name: 'Planner, executors and merge complete', phase: 'query', requiresSyntheticUser: true, expected: 'Trace includes planner decisions, executor outputs and merged evidence' },
    ],
    assertions: [
      { id: 'trace-complete', description: 'Classifier, resolver, planner, executors and merge are all represented' },
      { id: 'ambiguity-not-confident', description: 'Ambiguous entities are not treated as confidently resolved' },
    ],
    cleanup: cleanup('CHAT-006'),
  },
  {
    id: 'CHAT-007',
    name: 'Retrieval ownership and evidence relevance',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'owned-evidence', name: 'Retrieve owned evidence', phase: 'security', requiresSyntheticUser: true, expected: 'Evidence belongs to the authenticated synthetic user' },
      { id: 'cross-user-probe', name: 'Cross-user retrieval probe', phase: 'security', requiresSyntheticUser: true, expected: 'User B data is not returned or inferable' },
    ],
    assertions: [
      { id: 'rls-contract', description: 'User isolation is enforced at retrieval boundaries' },
      { id: 'relevant-evidence', description: 'Retrieved evidence is tied to the relevant entities' },
    ],
    cleanup: cleanup('CHAT-007'),
  },
  {
    id: 'CHAT-008',
    name: 'Memory ingestion and cognition refresh',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'ingest', name: 'Message produces memory operation', phase: 'ingestion', requiresSyntheticUser: true, expected: 'IR/memory operation is produced without duplicates' },
      { id: 'refresh-cognition', name: 'Cognition surfaces refresh', phase: 'ingestion', requiresSyntheticUser: true, expected: 'Memory, entity and provenance updates are visible after ingestion' },
    ],
    assertions: [
      { id: 'no-ingestion-duplicates', description: 'Async ingestion does not create duplicate memory records' },
      { id: 'ui-refresh-after-ingestion', description: 'Cognition UI receives fresh post-ingestion state' },
    ],
    cleanup: cleanup('CHAT-008'),
  },
  {
    id: 'CHAT-009',
    name: 'Identity correction audit history',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'correction', name: 'Apply identity correction', phase: 'identity', requiresSyntheticUser: true, expected: 'Truth-state transition records prior and next state' },
      { id: 'audit', name: 'Read correction audit trail', phase: 'identity', requiresSyntheticUser: true, expected: 'Audit history remains intact after correction' },
    ],
    assertions: [
      { id: 'truth-history', description: 'Corrections preserve audit history and provenance' },
      { id: 'canonical-identity', description: 'Canonical identity facts do not lose prior truth state' },
    ],
    cleanup: cleanup('CHAT-009'),
  },
  {
    id: 'CHAT-010',
    name: 'Controlled error recovery',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'api-failure', name: 'API failure injection', phase: 'recovery', requiresSyntheticUser: true, expected: 'UI receives controlled API error state' },
      { id: 'model-failure', name: 'Model failure injection', phase: 'recovery', requiresSyntheticUser: true, expected: 'Model failures do not corrupt persisted conversation state' },
      { id: 'db-failure', name: 'Database failure injection', phase: 'recovery', requiresSyntheticUser: true, expected: 'Database failures fail closed and preserve canonical state' },
    ],
    assertions: [
      { id: 'controlled-errors', description: 'API, model, retrieval and database failures produce controlled states' },
      { id: 'no-fallback-overwrite', description: 'Backend fallback never overwrites canonical server state' },
    ],
    cleanup: cleanup('CHAT-010'),
  },
  {
    id: 'CHAT-011',
    name: 'Persistence after navigation and reload',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'debounced-write', name: 'Navigate during pending write', phase: 'message', requiresSyntheticUser: true, expected: 'Pending writes flush or fail visibly before navigation loses state' },
      { id: 'reload', name: 'Reload conversation', phase: 'hydration', requiresSyntheticUser: true, expected: 'Reload restores identical canonical conversation state' },
    ],
    assertions: [
      { id: 'no-lost-debounce', description: 'Debounced writes are not lost during navigation' },
      { id: 'stable-reopen', description: 'Reopening restores the same canonical thread and messages' },
    ],
    cleanup: cleanup('CHAT-011'),
  },
  {
    id: 'CHAT-012',
    name: 'Multi-user security boundary',
    priority: 'P0',
    destructive: false,
    steps: [
      { id: 'user-a', name: 'Seed User A diagnostic data', phase: 'security', requiresSyntheticUser: true, expected: 'User A data is scoped by userId and runId' },
      { id: 'user-b', name: 'Probe as User B', phase: 'security', requiresSyntheticUser: true, expected: 'User B cannot retrieve, mutate or infer User A data' },
    ],
    assertions: [
      { id: 'no-cross-user-read', description: 'User A records are never visible to User B' },
      { id: 'no-cross-user-mutate', description: 'User B cannot mutate User A records' },
    ],
    cleanup: cleanup('CHAT-012'),
  },
];
